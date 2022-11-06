import React, { memo, useEffect, useState, useRef } from 'react';
import styles from './index.less';
import classnames from 'classnames';
import { history, useParams } from 'umi';
import { Button, DatePicker, Input, Table, Modal, Tabs, Dropdown, message } from 'antd';
import i18n from '@/i18n';
import AppHeader from '@/components/AppHeader';
import Iconfont from '@/components/Iconfont';
import Tree from '@/components/Tree';
import Loading from '@/components/Loading/Loading';
import MonacoEditor from '@/components/MonacoEditor';
import DraggableDivider from '@/components/DraggableDivider';
import SearchResult from '@/components/SearchResult';
import Menu, { IMenu, MenuItem } from '@/components/Menu';
import connectionServer from '@/service/connection';
import historyServer from '@/service/history';
import mysqlServer from '@/service/mysql';
import SearchInput from '@/components/SearchInput';
import { IConnectionBase, ITreeNode, IWindowTab, IDB } from '@/types'
import { toTreeList, createRandom, approximateTreeNode, getLocationHash } from '@/utils/index'
import { databaseType, DatabaseTypeCode, TreeNodeType, WindowTabStatus } from '@/utils/constants'
const monaco = require('monaco-editor/esm/vs/editor/editor.api');
import { language } from 'monaco-editor/esm/vs/basic-languages/sql/sql';
const { keywords } = language;

interface IProps {
  className?: any;
}
interface ITabItem extends IWindowTab {
  label: string;
  key: string;
}

const basicsTree: ITreeNode[] = []

export function DatabaseQuery({ treeData, activeTabKey, windowTab }: { treeData: any, activeTabKey: string, windowTab: IWindowTab }) {
  const params: { id: string, type: string } = useParams();
  const dataBaseType = params.type.toUpperCase() as DatabaseTypeCode;
  const [manageResultDataList, setManageResultDataList] = useState<any>();
  const monacoEditorBox = useRef<HTMLDivElement | null>(null);
  const monacoEditor = useRef<any>(null);
  const editorHintData = useRef<any>(null);

  useEffect(() => {
    connectConsole();
  }, [])

  const connectConsole = () => {
    let p = {
      consoleId: windowTab.id!,
      dataSourceId: windowTab.dataSourceId,
      databaseName: windowTab.databaseName,
    }
    mysqlServer.connectConsole(p)
  }

  const getEditor = (editor: any) => {
    monacoEditor.current = editor
    const model = editor.getModel(editor)
    model.setValue(windowTab.sql || windowTab.ddl || '')
  }

  const callback = () => {
    // monacoEditor.current && monacoEditor.current.layout()
  }

  const getMonacoEditorValue = () => {
    if (monacoEditor?.current?.getModel) {
      const model = monacoEditor?.current.getModel(monacoEditor?.current)
      const value = model.getValue()
      return value
    }
  }

  const executeSql = () => {
    const sql = getMonacoEditorValue()
    if (!sql) {
      message.warning('请输入sql');
      return
    }
    let p = {
      sql,
      consoleId: windowTab?.id!,
      dataSourceId: windowTab?.dataSourceId,
      databaseName: windowTab?.databaseName
    }
    mysqlServer.executeSql(p).then(res => {
      let p = {
        dataSourceId: windowTab?.dataSourceId,
        databaseName: windowTab?.databaseName,
        name: windowTab?.name,
        ddl: sql,
        type: dataBaseType
      }
      historyServer.createHistory(p)
      setManageResultDataList(res)
    })
  }

  const saveWindowTabTab = () => {
    let p = {
      name: windowTab?.name,
      type: dataBaseType,
      dataSourceId: params.id,
      databaseName: windowTab?.databaseName,
      status: WindowTabStatus.DRAFT,
      ddl: getMonacoEditorValue()
    }
    historyServer.saveWindowTab(p).then(res => {
      message.success('保存成功');
    })
  }

  return <>
    <div className={classnames(styles.databaseQuery, { [styles.databaseQueryConceal]: windowTab.id !== activeTabKey })}>
      <div className={styles.operatingArea}>
        <Button type="primary" onClick={executeSql}>执行</Button>
        <Button onClick={saveWindowTabTab}>保存</Button>
      </div>
      <div ref={monacoEditorBox} className={styles.monacoEditor}>
        {
          // editorHintData.current &&
          <MonacoEditor id={windowTab.id!} defaultValue={windowTab.sql} getEditor={getEditor}></MonacoEditor>
        }
      </div>
      <DraggableDivider callback={callback} direction='row' min={200} volatileRef={monacoEditorBox} />
      <div className={styles.searchResult}>
        <SearchResult manageResultDataList={manageResultDataList}></SearchResult>
      </div>
    </div>
  </>
}

export default memo<IProps>(function DatabasePage({ className }) {
  const params: { id: string, type: string } = useParams();
  const dataBaseType = params.type.toUpperCase() as DatabaseTypeCode;
  const letfRef = useRef<HTMLDivElement | null>(null);
  const [connectionDetaile, setConnectionDetaile] = useState<IConnectionBase>()
  const [currentDB, setCurrentDB] = useState<IDB>()
  const [activeKey, setActiveKey] = useState<string>();
  const [windowList, setWindowList] = useState<ITabItem[]>([]);
  const [treeData, setTreeData] = useState<ITreeNode[]>();
  const fixedTreeData = useRef<ITreeNode[]>();
  const [DBList, setDBList] = useState<IDB[]>();
  const [openDropdown, setOpenDropdown] = useState(false);
  const monacoHint = useRef<any>(null);
  const editorHintData = useRef<any>(null);


  const closeDropdownFn = () => {
    setOpenDropdown(false)
  }

  const disposalEditorHintData = (tableList: any) => {
    try {
      const myEditorHintData: any = {}
      tableList?.map((item: any) => {
        myEditorHintData[item.name] = item.children[0].children.map((item: any) => {
          return item.name
        })
      })
      editorHintData.current = myEditorHintData
    }
    catch {
      editorHintData.current = {}
    }
  }

  const registerCompletion = () => {
    monacoHint.current = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ...keywords],
      provideCompletionItems: (model: any, position: any) => {
        let suggestions: any = []
        const { lineNumber, column } = position
        const textBeforePointer = model.getValueInRange({
          startLineNumber: lineNumber,
          startColumn: 0,
          endLineNumber: lineNumber,
          endColumn: column,
        })

        const tokens = textBeforePointer.trim().split(/\s+/)
        const lastToken = tokens[tokens.length - 1] // 获取最后一段非空字符串

        if (lastToken.endsWith('.')) {
          const tokenNoDot = lastToken.slice(0, lastToken.length - 1)
          if (Object.keys(editorHintData.current).includes(tokenNoDot)) {
            suggestions = [...getTableSuggest(tokenNoDot)]
          }
        } else if (lastToken === '.') {
          suggestions = []
        } else {
          suggestions = [...getDBSuggest(), ...getSQLSuggest()]
        }
        console.log(suggestions)
        return {
          suggestions
        }
      },
    })
  }

  // 获取 SQL 语法提示
  const getSQLSuggest = () => {
    return keywords.map((key: any) => ({
      label: key,
      kind: monaco.languages.CompletionItemKind.Enum,
      insertText: key,
    }))
  }

  // 获取DB数据
  const getDBSuggest = () => {
    return Object.keys(editorHintData.current).map((key) => ({
      label: key,
      kind: monaco.languages.CompletionItemKind.Constant,
      insertText: key,
    }))
  }

  // 获取Table数据
  const getTableSuggest = (dbName: any) => {
    const tableNames = editorHintData.current[dbName]
    if (!tableNames) {
      return []
    }
    return tableNames.map((name: any) => ({
      label: name,
      kind: monaco.languages.CompletionItemKind.Constant,
      insertText: name,
    }))
  }

  useEffect(() => {
    if (openDropdown) {
      document.documentElement.addEventListener('click', closeDropdownFn)
    }
    return () => {
      document.documentElement.removeEventListener('click', closeDropdownFn)
    }
  }, [openDropdown])

  useEffect(() => {
    if (!params.id) return
    getDetaile();
    getDBList();
  }, [params.id])

  useEffect(() => {
    if (!currentDB) return
    getWindowList()
  }, [currentDB])

  useEffect(() => {
    if (!DBList?.length) return
    const locationHash: any = getLocationHash()
    console.log(locationHash)
    DBList.map(item => {
      if (locationHash?.databaseName && item.name == locationHash?.databaseName) {
        setCurrentDB(item)
        getTableList(item)
      } else {
        setCurrentDB(DBList?.[0])
        getTableList(DBList?.[0])
      }
    })
  }, [DBList])

  const getWindowList = () => {
    let p = {
      pageNo: 1,
      pageSize: 20,
      dataSourceId: params.id,
      databaseName: currentDB?.name
    }
    historyServer.getSaveList(p).then(res => {
      if (res?.data?.length) {
        const list = res.data.map(item => {
          return {
            ...item,
            label: item.name,
            key: item.id!
          }
        })
        setActiveKey(list?.[0]?.id)
        setWindowList(list)
      } else {
        addWindowTab([])
      }
    })
  }

  const getDBList = () => {
    connectionServer.getDBList({
      id: params.id
    }).then(res => {
      setDBList(res)
    })
  }

  const getTableList = (currentDB: IDB) => {
    let p = {
      dataSourceId: params.id,
      databaseName: currentDB?.name,
      pageNo: 1,
      pageSize: 10,
    }
    return mysqlServer.getList(p).then(res => {
      const tableList: ITreeNode[] = res.data?.map(item => {
        return {
          name: item.name,
          nodeType: TreeNodeType.TABLE,
          key: item.name,
          children: [
            {
              key: '1',
              name: '列',
              nodeType: TreeNodeType.LINE,
              children: toTreeList(item.columnList, 'name', 'nodeType', TreeNodeType.LINE)
            },
            {
              key: '2',
              name: '索引',
              nodeType: TreeNodeType.INDEXES,
              children: toTreeList(item.indexList, 'name', 'nodeType', TreeNodeType.INDEXES)
            }
          ]
        }
      })

      fixedTreeData.current = tableList
      setTreeData(tableList)
      monacoHint.current?.dispose()
      disposalEditorHintData(tableList)
      registerCompletion();
      return tableList
    })

  }

  const getDetaile = () => {
    let p = {
      id: params.id
    }
    connectionServer.getDetaile(p).then(res => {
      setConnectionDetaile(res)
    })
  }

  const callback = () => {
    // editor && editor.layout()
  }

  const addWindowTab = (windowList: ITabItem[]) => {
    let p = {
      name: `Default Tab${windowList?.length + 1}`,
      type: dataBaseType,
      dataSourceId: params.id,
      databaseName: currentDB?.name!,
      status: WindowTabStatus.DRAFT,
      sql: 'SELECT * FROM'
    }
    historyServer.saveWindowTab(p).then(res => {
      setWindowList([
        ...windowList,
        {
          ...p,
          id: res,
          label: p.name,
          key: res
        }
      ])
      setActiveKey(res)
    })
  };

  const closeWindowTab = (targetKey: string) => {
    let newActiveKey = activeKey;
    let lastIndex = -1;
    windowList.forEach((item, i) => {
      if (item.key === targetKey) {
        lastIndex = i - 1;
      }
    });
    const newPanes = windowList.filter(item => item.key !== targetKey);
    if (newPanes.length && newActiveKey === targetKey) {
      if (lastIndex >= 0) {
        newActiveKey = newPanes[lastIndex].key;
      } else {
        newActiveKey = newPanes[0].key;
      }
    }
    setWindowList(newPanes);
    setActiveKey(newActiveKey);
    let p = { id: targetKey };
    historyServer.deleteWindowTab(p);
  };

  const onEdit = (targetKey: any, action: 'add' | 'remove') => {
    if (action === 'add') {
      addWindowTab(windowList);
    } else {
      closeWindowTab(targetKey);
    }
  };

  const onChangeTab = (newActiveKey: string) => {
    setActiveKey(newActiveKey);
  };

  const searchTable = (value: string) => {
    if (fixedTreeData.current?.length) {
      setTreeData(approximateTreeNode(fixedTreeData.current, value));
    }
  }

  const DBListMenu = () => {
    const switchDB = (item: IDB) => {
      setOpenDropdown(false)
      if (item.name !== currentDB?.name) {
        setCurrentDB(item)
        getTableList(item)
      }
    }

    return <Menu>
      {
        DBList?.map(item => {
          return <MenuItem key={item.name} onClick={switchDB.bind(null, item)}>
            <div className={styles.switchDBItem}>
              <div className={styles.DBName}>{item.name}</div>
            </div>
          </MenuItem>
        })
      }
    </Menu>
  }

  return <>
    <div className={classnames(className, styles.box)}>
      <div ref={letfRef} className={styles.asideBox} id="database-left-aside">
        <div className={styles.aside}>
          <div className={styles.header}>
            <Dropdown open={openDropdown} overlay={DBListMenu} trigger={['click']}>
              <div className={styles.currentNameBox} onClick={(event) => { event.stopPropagation(); setOpenDropdown(true) }}>
                {
                  currentDB &&
                  <div className={styles.DBLogo} style={{ backgroundImage: `url(${databaseType[params.type.toUpperCase()].img})` }}></div>
                }
                <div className={styles.databaseName}>
                  {currentDB?.name}
                </div>
                {(DBList?.length || 0) > 1 && <Iconfont code="&#xe7b1;"></Iconfont>}
              </div>
            </Dropdown>

            <div className={styles.searchBox}>
              <SearchInput onChange={searchTable} placeholder='搜索'></SearchInput>
              {/* <div className={classnames(styles.refresh, styles.button)}>
                <Iconfont code="&#xec08;"></Iconfont>
              </div>
              <div className={classnames(styles.create, styles.button)}>
                <Iconfont code="&#xe631;"></Iconfont>
              </div> */}
            </div>
          </div>
          <div className={styles.overview}>
            <Iconfont code="&#xe63d;"></Iconfont>
            <span>{i18n('database.button.overview')}</span>
          </div>
          <Tree className={styles.tree} treeData={treeData}></Tree>
        </div>
      </div>
      <DraggableDivider callback={callback} volatileRef={letfRef} />
      <div className={styles.main}>
        <AppHeader className={styles.appHeader} showRight={false}>
          <div className={styles.tabsBox}>
            <Tabs
              type="editable-card"
              onChange={onChangeTab}
              activeKey={activeKey}
              onEdit={onEdit}
              items={windowList}
            />
          </div>
        </AppHeader>
        <div className={styles.databaseQueryBox}>
          {
            currentDB &&
            windowList?.map((i: IWindowTab) => {
              return <DatabaseQuery treeData={treeData} windowTab={i} key={i.databaseName + i.id} activeTabKey={activeKey!}></DatabaseQuery>
            })
          }
        </div>
      </div>
    </div>
  </>
});
