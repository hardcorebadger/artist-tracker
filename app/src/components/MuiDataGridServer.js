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
import {ColumnDataContext, CurrentReportContext} from "../App";
import {Chip, Link as MUILink, Tooltip} from '@mui/material'
import { Link as RouterLink } from "react-router-dom";
import {GridFilterOperator} from "@mui/x-data-grid-pro";
import moment from "moment/moment";

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
             } else {
                 return null
             }
        }
        if (func === 'data') {
            return null
        }
        return null
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
const bakeColumns = (selection, toggleFavs, toggleRowFav, favoritesOnly, quickFilter) => {
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
  columnOptions['evaluation.status']['renderCell'] = (params) => (
      <Chip
          onClick={() => {
              quickFilter('evaluation.status', 'is', params.value)
          }}
          variant="outlined" size='small' color={params.value == 1 ? "error" : params.value == 0 ? "primary" : "warning"} label={params.value == 0 ? 'Unsigned' : (params.value == 1 ? 'Signed' : 'Unknown')} />
  )
  columnOptions['evaluation.back_catalog']['renderCell'] = (params) => (
      <Chip
          onClick={() => {
              quickFilter('evaluation.back_catalog', 'is', params.value)
          }}
          variant="outlined" size='small' color={params.value == 1 ? "warning" : "primary"} label={(params.value == null ? 'Unknown' : (params.value == 0 ? 'Clean' : 'Dirty'))} />
  )

  columnOptions['evaluation.distributor_type']['renderCell'] = (params) => {
      return (
          <Chip variant="outlined" size='small'
                onClick={() => {
                    quickFilter('evaluation.distributor_type', 'is', params.value)
                }}
                color={params.value === 2 ? "error" : (params.value === 1|| params.value == null ? "warning" : "primary")}
                label={params.value !== null ? (params.value === 0 ? "DIY" : (params.value === 1 ? "Indie" : "Major")) : "Unknown"}/>

      )
  }
  columnOptions['users']['renderCell'] = (params) => {
      return (

          <Box flex flexWrap={'no-wrap'} flexDirection={'row'} align={'center'} justifyContent={'flex-start'}>
              {params.value.map((item, index) => {
                  return <Tooltip  key={"user-"+item.id+"-"+item.artist_id}  title={"Added on: " + moment(item.created_at).format("lll")}><Chip onClick={() => {
                      quickFilter('users', 'is', item.id)
                  }} sx={{marginLeft: (index > 0 ? '5px' : '0')}} variant="outlined" size='small' color={"info"} label={item.first_name + " " + item.last_name}/>
                  </Tooltip>
              })}
          </Box>

      )
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

const initialPagination = {
    page: 0,
    pageSize: 20,
}

export default function MuiDataGridController({initialReportName, initialColumnOrder, initialFilterValues, onSave, onSaveNew, onDelete, onOpenArtist}) {

    const { statisticTypes, linkSources, tagTypes, users, existingTags } = useContext(ColumnDataContext);
    const { currentRows, setCurrentRows, currentQueryModel, setCurrentQueryModel } = useContext(CurrentReportContext);

    // Server side data source for the table
    const getArtists = httpsCallable(functions, 'get_artists')
    const [paginationModel, setPaginationModel] = useState(deepCopy(currentQueryModel?.pagination ?? initialPagination));
    const [sortModel, setSortModel] = useState(deepCopy(currentQueryModel?.sorts ?? []));
    const [dataIsLoading, setDataIsLoading] = useState(false)
    const [columnOrder, setColumnOrder] = useState(deepCopy(currentQueryModel?.columnOrder ?? initialColumnOrder))
    if (!initialFilterValues?.hasOwnProperty('items')) {
        initialFilterValues = {items:[]}
    }
    const [filterModel, setFilterModel] = useState(deepCopy(currentQueryModel?.filters ?? initialFilterValues))
    const [currentReqTime, setCurrentReqTime] = useState(null)
    const apiRef = useGridApiRef();


    useEffect(() => {


        const fetcher = async () => {
            setDataIsLoading(true)
            const startTime = Date.now()
            setCurrentReqTime(startTime)
            // fetch data from server
            const objectsEqual = (o1, o2) =>
                typeof o1 === 'object' && Object.keys(o1).length > 0
                    ? Object.keys(o1).length === Object.keys(o2).length
                    && Object.keys(o1).every(p => objectsEqual(o1[p], o2[p]))
                    : o1 === o2;

            const arraysEqual = (a1, a2) =>
                a1.length === a2.length && a1.every((o, idx) => objectsEqual(o, a2[idx]));

            const resp = await getArtists({page: paginationModel.page,
                pageSize: paginationModel.pageSize,
                sortModel,
                filterModel});
                setDataIsLoading(false)

                if (resp.data.page !== paginationModel.page || resp.data.pageSize !== paginationModel.pageSize) {
                    return
                }

                if (!arraysEqual(resp.data.filterModel?.items ?? [], filterModel?.items ?? [])) {
                    return
                }
                if (JSON.stringify(resp.data.sortModel) !== JSON.stringify(sortModel) && !objectsEqual(resp.data.sortModel, sortModel)) {
                    return
                }
                setCurrentRows({
                    time: startTime,
                    rows: resp.data.rows,
                    rowCount: resp.data.rowCount
                });
        };
        let refreshNeeded = false;
        if (currentRows === null || currentQueryModel === null) {
            refreshNeeded = true;
        } else {
            if (JSON.stringify(currentQueryModel?.filters ?? initialFilterValues) !== JSON.stringify(filterModel)) {
                refreshNeeded = true
            } else if (JSON.stringify(currentQueryModel?.sorts ?? []) !== JSON.stringify(sortModel)) {
                refreshNeeded = true
            } else if (JSON.stringify(currentQueryModel?.pagination ?? initialPagination) !== JSON.stringify(paginationModel)) {
                refreshNeeded = true
            }

        }
        const updateModel =  {
            filters: filterModel,
            sorts: sortModel,
            pagination: paginationModel,
            columnOrder: currentQueryModel?.columnOrder ?? null,
        }
        setCurrentQueryModel(updateModel)

        if (refreshNeeded) {
            console.log(updateModel, 'fetching')
            fetcher();
        }
    }, [paginationModel, sortModel, filterModel]);
    // saves state for report config (currently only works for add/remove column, rest (reorder, filter, sort) are TODO)

    const [reportName, setReportName] = useState(initialReportName)


    useEffect(() => {
        const updateModel = {
            columnOrder: columnOrder,
            ...(currentQueryModel ?? {}),
        }
        setCurrentQueryModel(updateModel)
        localStorage.setItem('currentQueryModel', JSON.stringify(updateModel))
    }, [columnOrder, initialFilterValues]);

    // callback from the column menu to the grid to set the columns
    const applyColumnSelection = (selection) => {
        setColumnOrder(deepCopy(applyColumnOrder(columnOrder, selection)))
    }

    const quickFilter = (field, operator, value) => {
        let set = false
        const newFilterModel = deepCopy(filterModel ?? {})
        filterModel?.items?.forEach((item, index) => {
            if (item.field === field && operator === operator) {
                newFilterModel.items[index] = {
                    ...item,
                    value: value,

                }
                set = true
            }
        })
        if (!set) {
            newFilterModel.items.push({
                field,
                operator,
                value,
                id: Date.now()
            })
        }
        setFilterModel(newFilterModel)

    }

    // reset to the saved version of the report
    const revertState = () => {
        setColumnOrder(deepCopy(initialColumnOrder))
        setFilterModel(deepCopy(initialFilterValues))
        setCurrentQueryModel(null)
        setReportName(initialReportName)
    }

    const handleColumnOrderChange = (change) => {
      const column = change.column.field
      setColumnOrder( array_move(deepCopy(columnOrder), change.oldIndex -1, change.targetIndex -1))

    }
    useEffect(() => {

    }, [existingTags, users])
    
    // bake the columns for MUI based on current column order object
    const columns = bakeColumns(buildColumnSelection(columnOrder, true), null, null, null, quickFilter)

    // check current state vs saved report config to see if we should show save button
    const hasBeenEdited = reportName !== initialReportName || !compareState(initialColumnOrder, columnOrder, initialFilterValues, filterModel)

    return (
        
        <VStack spacing={5} align="left" >
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
        <Box width="calc(100vw - 300px)" maxWidth={'100%'}>
        {/* This is MUI */}
        <div
          style={{
              display: 'flex',
              flexDirection: 'column',
              height: 'calc(100vh - 175px)',
              minHeight: '750px'

          }}
          >
        <ThemeProvider theme={theme}>
            {/* CssBaseline kickstart an elegant, consistent, and simple baseline to build upon. */}
            {/* <CssBaseline /> */}
            
               
                <DataGridPro
                  columns={columns}
                  loading={dataIsLoading}
                  rows={currentRows?.rows ?? []}
                  sortingMode="server"
                  filterMode="server"
                  paginationMode="server"
                  onSortModelChange={setSortModel}
                  onFilterModelChange={setFilterModel}
                  onColumnOrderChange={handleColumnOrderChange}
                  pagination
                  ref={apiRef}
                  onCellClick={(e) => {
                      if (e.field === 'name') {
                          const artist = currentRows?.rows?.filter((row) => row?.id == e.id).pop()
                          onOpenArtist(artist)
                      }
                  }}
                  rowCount={currentRows?.rowCount ?? 0}
                  filterModel={filterModel}
                  sortModel={sortModel}
                  onPaginationModelChange={setPaginationModel}
                  paginationModel={paginationModel}
                  initialState={{
                      pagination: currentQueryModel?.pagination ?? initialPagination,
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