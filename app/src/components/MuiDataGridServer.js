import { HStack, Text, VStack, IconButton, Button } from "@chakra-ui/react";
import { DataGridPro } from '@mui/x-data-grid-pro';
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
import {StatisticTypeContext} from "../App";

// MUI theme for the data grid
const theme = createTheme({
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
    valueGetter: (value, row) => row['statistics'].filter((stat) => stat['statistic_type_id'] === columnOptions[metric].statTypeId)[0][func],

    ...metricFunctions[func].options
})

// given a new column selection from the selector menu, build a new column order based on current ordering
const applyColumnOrder = (currentOrder, selectedColumns) => {
    Object.keys(selectedColumns).forEach(key => {
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
const bakeColumns = (selection, toggleFavs, toggleRowFav, favoritesOnly, statTypes) => {
  let columns = [
    {
      field: 'name',
      headerName: "Artist",
      disableReorder: true
    }
  ]
  for (let typeIndex in statTypes) {
      const type = statTypes[typeIndex];
      const key = 'statistic.' + type['id']
      const sourceName = type['source'].charAt(0).toUpperCase() + type['source'].slice(1);
      columnOptions[key] = {
          field: key,
          keyName: type['source'] + "." + type['key'],
          headerName:  sourceName +' ' + type['name'],
          statTypeId: type['id'],
          isMetric: true
      }
  }
  Object.keys(selection).forEach(key => {
    if (columnOptions[key].isMetric) {
      Object.keys(selection[key]).forEach(subkey => {
        if (selection[key][subkey]) {
          columns.push(metricColumnFactory(key, subkey))
        }
      })
    } else {
      if (selection[key])
        columns.push(columnOptions[key])
    }
  })
  // console.log(selection)
  return columns
}



export default function MuiDataGridController({initialReportName, initialColumnOrder, initialFilterValues, onSave, onSaveNew, onDelete, onOpenArtist}) {
    const [statTypes, setStatTypes] = useState(null)
    const [currentParams, setCurrentParams] = useState(null)
    const [currentRows, setCurrentRows] = useState(null)
    const { statisticTypes, setStatisticTypes } = useContext(StatisticTypeContext);

    // Server side data source for the table
    const getArtists = httpsCallable(functions, 'get_artists')
    const [rows, setRows] = useState([]);
    const [paginationModel, setPaginationModel] = useState({
        page: 0,
        pageSize: 10,
    });
    const [filterModel, setFilterModel] = useState({ items: [] });
    const [sortModel, setSortModel] = useState([]);

    useEffect(() => {
        const fetcher = async () => {
            // fetch data from server
            const resp = await getArtists({page: paginationModel.page,
                pageSize: paginationModel.pageSize,
                sortModel,
                filterModel});

            setRows({
                rows: resp.data.rows,
                rowCount: resp.data.rowCount
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

    const [columnOrder, setColumnOrder] = useState(deepCopy(initialColumnOrder))

    const [filterValue, setFilterValue] = useState(deepCopy(initialFilterValues))

    // callback from the column menu to the grid to set the columns
    const applyColumnSelection = (selection) => {
        console.log(selection)
        setColumnOrder(deepCopy(applyColumnOrder(columnOrder, selection)))
    }

    // reset to the saved version of the report
    const revertState = () => {
        setColumnOrder(deepCopy(initialColumnOrder))
        setFilterValue(deepCopy(initialFilterValues))
        setReportName(initialReportName)
    }
    
    // bake the columns for MUI based on current column order object
    const columns = bakeColumns(buildColumnSelection(columnOrder), null, null, null, statisticTypes)

    // check current state vs saved report config to see if we should show save button
    const hasBeenEdited = reportName !== initialReportName || !compareState(initialColumnOrder, columnOrder, initialFilterValues, filterValue)

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
          {hasBeenEdited&& <Button colorScheme='primary' onClick={() => onSave(columnOrder, filterValue, reportName)}>Save</Button> }
          {(hasBeenEdited && onSaveNew) && <Button colorScheme='primary' onClick={() => onSaveNew(columnOrder, filterValue, reportName)}>Save as New</Button>}
        </HStack>
        
        </HStack>
        {/* This is MUI */}
        <ThemeProvider theme={theme}>
            {/* CssBaseline kickstart an elegant, consistent, and simple baseline to build upon. */}
            <CssBaseline />
                <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 'calc(100vh - 175px)',
                }}
                >
                <DataGridPro
                  columns={columns}
                  rows={rows?.rows ?? []}
                  sortingMode="server"
                  filterMode="server"
                  paginationMode="server"
                  onPaginationModelChange={setPaginationModel}
                  onSortModelChange={setSortModel}
                  onFilterModelChange={setFilterModel}
                  pagination
                  rowCount={rows?.rowCount ?? 0}
                  initialState={{
                    pagination: {
                      paginationModel: { pageSize: 10, page: 0 },
                      rowCount: 0,
                    }
                  }}
                  pageSizeOptions={[10, 20, 50]}
                 />
                </div>
        </ThemeProvider>
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