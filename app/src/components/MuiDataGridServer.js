import {HStack, Text, VStack, IconButton, Button, Link, Badge, chakra, Box, Wrap} from "@chakra-ui/react";
import {DataGridPro, GridColumnHeaderItem, GridHeader, useGridApiContext, useGridApiRef} from '@mui/x-data-grid-pro';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { red } from '@mui/material/colors';
import { createTheme } from '@mui/material/styles';

import EditableTitle from "./EditableTitle";
import ConfirmButton from "./ConfirmButton";
import DataGridColumnMenu from './DataGridColumnMenu'
import {useContext, useEffect, useState} from "react";
import Iconify from "./Iconify";
import { buildColumnSelection, columnOptions, metricFunctions } from "./DataGridConfig";
import { deepCompare, deepCopy } from "../util/objectUtil";
import { httpsCallable } from "firebase/functions";
import { functions } from '../firebase';
import {ColumnDataContext} from "../App";
import {Link as MUILink, Tooltip} from '@mui/material'
import { Link as RouterLink } from "react-router-dom";

// const ChakraDataGrid = chakra(DataGrid);

// MUI theme for the data grid
export const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: {
      main: '#329795',
    },
    secondary: {
      main: '#4049d3',
    },
    error: {
      main: red.A400,
    },
  },
});

// compares the state of the report to the saved version to see if we should show save button
const compareState = (
    initialColumnOrder, columnOrder, 
    initialFilterValues, filterValue
  ) => {
    return (
    deepCompare(initialColumnOrder, columnOrder) &&
    deepCompare(initialFilterValues, filterValue)
    )
  }

// Comes up with column names based on a stat and the function (ie WoW, MoM etc)
const metricColumnFactory = (metric, func) => ({
    field: metric + "-" + func,
    headerName: columnOptions[metric].headerName + " (" + metricFunctions[func].headerName + ")",
    valueGetter: (data) => {
        if (data?.row && data.row['statistics']) {
             const filtered = data.row['statistics'].filter((stat) => stat['statistic_type_id'] === columnOptions[metric]?.statTypeId)
             if (filtered.length > 0 && func in filtered[0]) {
                 return filtered[0][func]
             }
        }
        if (func === 'data') {
            return null
        }
        return 'n/a'
    },
    renderHeader: columnOptions[metric].renderHeader,
    description: columnOptions[metric].description,
    ...metricFunctions[func].options
})

// given a new column selection from the selector menu, build a new column order based on current ordering
const applyColumnOrder = (currentOrder, selectedColumns) => {
    Object.keys(selectedColumns).forEach(key => {
      if (key === 'link') {
          Object.keys(selectedColumns[key]).forEach(linkSource => {
              const col = key+"_"+linkSource
              if (selectedColumns[key][linkSource]) {
                  if (!currentOrder.includes(col)) {
                      currentOrder.push(col)
                  }
              } else {
                  if (currentOrder.includes(col)) {
                      currentOrder = currentOrder.filter(element => element != col)
                  }
              }
          })
      } else
      if (columnOptions[key].isMetric) {
        Object.keys(selectedColumns[key]).forEach(subkey => {
          const col = key+"-"+subkey
          if (selectedColumns[key][subkey]) {
            if (!currentOrder.includes(col)) {
              currentOrder.push(col)
            }
          } else {
            if (currentOrder.includes(col)) {
              currentOrder = currentOrder.filter(element => element != col)
            }
          }
        })
      } else {
        if (selectedColumns[key] && !currentOrder.includes(key))
          currentOrder.push(key)
        else if (!selectedColumns[key] && currentOrder.includes(key))
          currentOrder = currentOrder.filter(element => element != key)
      }
    })
    return currentOrder
  }
  
// given a column selection from available columns, build the columns for MUI format
const bakeColumns = (selection, toggleFavs, toggleRowFav, favoritesOnly, statTypes, linkSources) => {
  let columns = [
    {
      field: 'name',
      headerName: "Artist",
      disableReorder: true,
      order: 0,
      flex: 1,
      minWidth: 150,
      cellClassName: 'hover-cell',
      renderCell: (params) => (<strong>{params.value}</strong>)
    }
  ]
  for (let typeIndex in statTypes) {
      const type = statTypes[typeIndex];
      const key = 'statistic.' + type['id']
      const sourceName = type['source'].charAt(0).toUpperCase() + type['source'].slice(1);
      const linkSource = linkSources.filter((s) => s.key === type['source']).pop()
      columnOptions[key] = {
          field: key,
          keyName: type['source'] + "." + type['key'],
          headerName:  sourceName +' ' + type['name'],
          statName: type['name'],
          statTypeId: type['id'],
          source: type['source'],
          description: sourceName +' ' + type['name'],
          renderHeader: (params) => (
              <Tooltip title={linkSource['display_name'] + ' ' + type['name']}>
                  <Box flex align={'center'} flexWrap={"nowrap"}>
                      {linkSource && linkSource['logo'] ? <Iconify sx={{display: 'inline-block'}} icon={linkSource['logo']}></Iconify> : null}
                      <Text display={'inline-block'}>&nbsp;{type['name']}</Text>
                  </Box>
              </Tooltip>
          ),
          isMetric: true
      }
  }
  for (let typeIndex in linkSources) {
      const type = linkSources[typeIndex];

      const key = 'link_' + type['key']
      columnOptions[key] = {
          field: key,
          keyName: key,
          social: type['social'],
          filterable: false,
          sortable: false,
          headerName: type['display_name'] + ' Link',
          description:  type['display_name'] + ' Link',
          renderHeader: (params) => (
              <Tooltip title={type['display_name'] + ' Link'}>
                  <Wrap align={'center'}>
                      {type['logo'] ? <Iconify sx={{display: 'inline-block'}} icon={type['logo']}></Iconify> : null}
                      Link
                  </Wrap>
              </Tooltip>
          ),
          renderCell: (params) => ( <MUILink color='primary' href={params.value}>{type['display_name']} <Iconify icon="mdi:external-link" sx={{display:'inline-block'}} /></MUILink> ),
          isMetric: false
      }
  }



  Object.keys(selection).forEach(key => {
      if (key === 'link') {
          Object.keys(selection[key]).forEach(linkSource => {
              if (selection[key][linkSource] !== -1) {
                  let colDef = columnOptions['link_' + linkSource]
                  colDef['source'] = linkSource
                  colDef['order'] = selection[key][linkSource] + 1
                  columns.push(colDef)
              }
          })
      } else if (columnOptions[key].isMetric) {
      Object.keys(selection[key]).forEach(subkey => {
        if (selection[key][subkey] !== -1) {
            const colDef = metricColumnFactory(key, subkey)
            colDef.function = subkey;
            colDef.order = selection[key][subkey] + 1
          columns.push(colDef)
        }
      })
    } else {
      if (selection[key] !== -1) {
          const colDef = columnOptions[key];
          colDef.order = selection[key] + 1
          columns.push(colDef)
      }
    }
  })

    columns = columns.sort(function(a,b){
        return a.order > b.order ? 1: -1
    })
  return columns;
}

function array_move(arr, old_index, new_index) {
    if (new_index >= arr.length) {
        var k = new_index - arr.length + 1;
        while (k--) {
            arr.push(undefined);
        }
    }
    arr.splice(new_index, 0, arr.splice(old_index, 1)[0]);
    return arr; // for testing
}

export default function MuiDataGridController({initialReportName, initialColumnOrder, initialFilterValues, onSave, onSaveNew, onDelete, onOpenArtist}) {
    const [statTypes, setStatTypes] = useState(null)
    const [currentParams, setCurrentParams] = useState(null)
    const [currentRows, setCurrentRows] = useState(null)
    const { statisticTypes, setStatisticTypes, linkSources } = useContext(ColumnDataContext);

    // Server side data source for the table
    const getArtists = httpsCallable(functions, 'get_artists')
    const [rowRequests, setRowRequests] = useState({});
    const [paginationModel, setPaginationModel] = useState({
        page: 0,
        pageSize: 20,
    });
    const [sortModel, setSortModel] = useState([]);
    const [dataIsLoading, setDataIsLoading] = useState(false)
    const [columnOrder, setColumnOrder] = useState(deepCopy(initialColumnOrder))
    if (!initialFilterValues?.hasOwnProperty('items')) {
        initialFilterValues = {items:[]}
    }
    const [filterModel, setFilterModel] = useState(deepCopy(initialFilterValues))
    const [currentReqTime, setCurrentReqTime] = useState(null)
    const apiRef = useGridApiRef();

    useEffect(() => {
        const fetcher = async () => {
            setDataIsLoading(true)
            const startTime = Date.now()
            setCurrentReqTime(startTime)
            // fetch data from server
            const resp = await getArtists({page: paginationModel.page,
                pageSize: paginationModel.pageSize,
                sortModel,
                filterModel});
                // setDataIsLoading(false)
                const newReq = {}
                newReq[startTime] = {
                    time: startTime,
                    rows: resp.data.rows,
                    rowCount: resp.data.rowCount
                }
                setRowRequests({
                    ...newReq,
                    ...rowRequests
                });
        };
        fetcher();
    }, [paginationModel, sortModel, filterModel]);
    // calls every time we need an update
    // params are printing on server (main.py at the bottom)
    // const customDataSource = {
    //
    //   getRows: async (params) => {
    //     console.log('params: ', params)
    //       console.log('current: ')
    //   if (currentRows !== null && JSON.stringify(params) === JSON.stringify(currentParams)) {
    //       return currentRows
    //   }
    //   const resp = await getArtists({...params});
    //       const returnData = {
    //           rows: resp.data.rows,
    //           rowCount: resp.data.rowCount,
    //       };
    //     return returnData;
    //   },
    // }

    // example of how columns are supposed to look for MUI

    // const columns = [
    //     { field: 'col1', headerName: 'Column 1', width: 150 },
    //     { field: 'col2', headerName: 'Column 2', width: 150 },
    // ];

    // saves state for report config (currently only works for add/remove column, rest (reorder, filter, sort) are TODO)

    const [reportName, setReportName] = useState(initialReportName)


    useEffect(() => {

    }, [columnOrder, initialFilterValues]);

    // callback from the column menu to the grid to set the columns
    const applyColumnSelection = (selection) => {
        setColumnOrder(deepCopy(applyColumnOrder(columnOrder, selection)))
    }

    // reset to the saved version of the report
    const revertState = () => {
        setColumnOrder(deepCopy(initialColumnOrder))
        setFilterModel(deepCopy(initialFilterValues))
        setReportName(initialReportName)
    }

    const rows = rowRequests[currentReqTime] ?? {}

    if (rows && rows.hasOwnProperty('time') && rows['time'] === currentReqTime) {
        if (dataIsLoading) {
            setDataIsLoading(false)
        }
        if (Object.keys(rowRequests).length > 1) {
            const newReq = {};
            newReq[currentReqTime] = rows
            setRowRequests(newReq)
        }
    }

    const handleColumnOrderChange = (change) => {
      const column = change.column.field
      setColumnOrder( array_move(deepCopy(columnOrder), change.oldIndex -1, change.targetIndex -1))

    }
    
    // bake the columns for MUI based on current column order object
    const columns = bakeColumns(buildColumnSelection(columnOrder, true), null, null, null, statisticTypes, linkSources)

    // check current state vs saved report config to see if we should show save button
    const hasBeenEdited = reportName !== initialReportName || !compareState(initialColumnOrder, columnOrder, initialFilterValues, filterModel)

    return (
        
        <VStack spacing={5} align="left">
        <HStack px={6} justifyContent='space-between'>
        <VStack spacing={3} align="left">
        <EditableTitle value={reportName} setValue={setReportName} />
        <Text size="sm" color="text.subtle">Artist Report</Text>
        </VStack>
        <HStack>
          {onSaveNew && 
          <ConfirmButton button={<IconButton variant='outline' icon={<Iconify icon="mdi:trash"/>}/>}
          title="Delete artist report"
          body="Are you sure you want to delete this report?"
          affirmative="Delete"
          onAffirm={onDelete}
          />
          }
          <DataGridColumnMenu currentSelection={buildColumnSelection(columnOrder)} applySelection={applyColumnSelection} />
          {(hasBeenEdited && onSaveNew)&& <Button colorScheme='primary' variant='outline' onClick={revertState}>Revert</Button>}
          {hasBeenEdited&& <Button colorScheme='primary' onClick={() => onSave(columnOrder, filterModel, reportName)}>Save</Button> }
          {(hasBeenEdited && onSaveNew) && <Button colorScheme='primary' onClick={() => onSaveNew(columnOrder, filterModel, reportName)}>Save as New</Button>}
        </HStack>
        
        </HStack>
        <Box width="calc(100vw - 300px)">
        {/* This is MUI */}
        <div
          style={{
              display: 'flex',
              flexDirection: 'column',
              height: 'calc(100vh - 175px)',

          }}
          >
        <ThemeProvider theme={theme}>
            {/* CssBaseline kickstart an elegant, consistent, and simple baseline to build upon. */}
            {/* <CssBaseline /> */}
            
               
                <DataGridPro
                  columns={columns}
                  loading={dataIsLoading}
                  rows={rows?.rows ?? []}
                  sortingMode="server"
                  filterMode="server"
                  paginationMode="server"
                  onPaginationModelChange={setPaginationModel}
                  onSortModelChange={setSortModel}
                  onFilterModelChange={setFilterModel}
                  onColumnOrderChange={handleColumnOrderChange}
                  pagination
                  ref={apiRef}
                  onCellClick={(e) => {
                      if (e.field === 'name') {
                          const artist = rows?.rows?.filter((row) => row?.id == e.id).pop()
                          onOpenArtist(artist)
                      }
                  }}
                  rowCount={rows?.rowCount ?? 0}
                  filterModel={filterModel}
                  sortModel={sortModel}
                  initialState={{
                    pagination: {
                      paginationModel: { pageSize: 20, page: 0 },
                      rowCount: 0,
                    },
                  }}
                  
                  pageSizeOptions={[10, 20, 50]}
                 />
                
        </ThemeProvider>
        </div>
        </Box>
        {/* End MUI */}
      </VStack>
    )
}

String.prototype.ucwords = function() {
    const str = this.toLowerCase();
    return str.replace(/(^([a-zA-Z\p{M}]))|([ -][a-zA-Z\p{M}])/g,
        function(s){
            return s.toUpperCase();
        });
};