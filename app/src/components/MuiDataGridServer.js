import { HStack, Text, VStack, IconButton, Button } from "@chakra-ui/react";
import { DataGridPro } from '@mui/x-data-grid-pro';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { red } from '@mui/material/colors';
import { createTheme } from '@mui/material/styles';
import EditableTitle from "./EditableTitle";
import ConfirmButton from "./ConfirmButton";
import DataGridColumnMenu from './DataGridColumnMenu'
import { useState } from "react";
import Iconify from "./Iconify";
import { buildColumnSelection, columnOptions, metricFunctions } from "./DataGridConfig";
import { deepCompare, deepCopy } from "../util/objectUtil";
import { httpsCallable } from "firebase/functions";
import { functions } from '../firebase';

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
const bakeColumns = (selection, toggleFavs, toggleRowFav, favoritesOnly) => {
  let columns = [
    {
      field: 'name',
      headerName: "Artist",
      disableReorder: true
    }
  ]
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

    // Server side data source for the table
    const getArtists = httpsCallable(functions, 'get_artists')

    // calls every time we need an update
    // params are printing on server (main.py at the bottom)
    const customDataSource = {
      getRows: async (params) => {
        console.log(params)
        const resp = await getArtists({...params});
        console.log(resp)
       
        return {
          rows: resp.data.rows,
          rowCount: resp.data.rowCount,
        };
      },
    }

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
    const columns = bakeColumns(buildColumnSelection(columnOrder), null, null, null)

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
                  unstable_dataSource={customDataSource}
                  pagination
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