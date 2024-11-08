import { Heading, HStack, Text, VStack, IconButton, Button } from "@chakra-ui/react";
import { 
    DataGridPro, 
    GridToolbar,
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarExport,
    GridToolbarDensitySelector,
} from '@mui/x-data-grid-pro';
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
import { Box } from "@mui/material";
import { useUser } from "../routing/AuthGuard";
import { useNavigate } from "react-router-dom";
import { useCollectionOnce } from "react-firebase-hooks/firestore";
import { collection, query, where } from "firebase/firestore";
import {db, functions} from "../firebase";
import {httpsCallable} from "firebase/functions";

// A custom theme for this app
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

function CustomToolbar() {
    return (
      <GridToolbarContainer>
        <GridToolbarColumnsButton />
        <GridToolbarFilterButton />
        <GridToolbarDensitySelector
          slotProps={{ tooltip: { title: "Hi" } }}
        />
        <Box sx={{ flexGrow: 1 }} />
        <GridToolbarExport
          slotProps={{
            tooltip: { title: 'Export data' },
            button: { variant: 'outlined' },
          }}
        />
      </GridToolbarContainer>
    );
}

const compareState = (
    initialColumnOrder, columnOrder, 
    initialFilterValues, filterValue
  ) => {
    return (
    deepCompare(initialColumnOrder, columnOrder) &&
    deepCompare(initialFilterValues, filterValue)
    )
  }

const metricColumnFactory = (metric, func) => ({
    field: metric + "-" + func,
    headerName: columnOptions[metric].headerName + " (" + metricFunctions[func].headerName + ")",
    ...metricFunctions[func].options
})


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
  

const bakeColumns = (selection, toggleFavs, toggleRowFav, favoritesOnly) => {
    let columns = [
    //   {
    //     field: 'favorite',
    //     header: <FavoritesButton filled={favoritesOnly} sx={{marginBottom:-1}} action={toggleFavs}/>,
    //     render: row => <FavoritesButton filled={row.value} action={toggleRowFav} data={row.data.id}/>,
    //     sortable: false,
    //     draggable: true,
    //     width: 10,
    //   },
      {
        field: 'name',
        headerName: "Artist",
        disableReorder: true
        // render: row => <Text color='text.default' fontWeight='semibold'>{row.value}</Text>,
        // defaultFlex: 1,
        // draggable: true,
        // minWidth: 130
        // cell: row => {return (<Text fontWeight="bold">{row.name}</Text>)}
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

  const bakeRows = (selectedColumns, raw_data) => {
    let baked_rows = []
    raw_data.forEach(row => {
      let baked_row = {
        name: row['name'],
        // favorite: row['watching_details'][orgId]['favorite'],
        id: row['spotify_id'],
        raw: row
      }
      Object.keys(columnOptions).forEach(key => {
        if (columnOptions[key].isMetric) {
          Object.keys(selectedColumns[key]).forEach(subkey => {
            if (selectedColumns[key][subkey]) {
              baked_row[key+"-"+subkey] = metricFunctions[subkey].op(row[key])
            }
          })
        } else {
          if (columnOptions[key].op != null) {
            baked_row[key] = columnOptions[key].op(row[key])
          } else {
            baked_row[key] = row[key]
          }
        }
      })
      baked_rows.push(baked_row)
    })
    return baked_rows
  }

export default function MuiDataGridController({initialReportName, initialColumnOrder, initialFilterValues, onSave, onSaveNew, onDelete, onOpenArtist}) {
    
    const user = useUser()
    const navigate = useNavigate()
    // console.log("grid rerender")

    const [artists, artistsLoading, artistsError] = useCollectionOnce(
    query(collection(db, 'artists_v2'), 
        where("ob_status", "==", "onboarded"),
        where("watching", "array-contains", user.org.id)
    )
    )

    const raw_data = artistsError || artistsLoading ? [] : artists.docs.map((d) => d.data())

    // const columns = [
    //     { field: 'col1', headerName: 'Column 1', width: 150 },
    //     { field: 'col2', headerName: 'Column 2', width: 150 },
    // ];

    const [reportName, setReportName] = useState(initialReportName)

    const [columnOrder, setColumnOrder] = useState(deepCopy(initialColumnOrder))

    const [filterValue, setFilterValue] = useState(deepCopy(initialFilterValues))

    const applyColumnSelection = (selection) => {
        console.log(selection)
        setColumnOrder(deepCopy(applyColumnOrder(columnOrder, selection)))
    }

    const revertState = () => {
        setColumnOrder(deepCopy(initialColumnOrder))
        setFilterValue(deepCopy(initialFilterValues))
        setReportName(initialReportName)
        // if (gridApi) {
        //   console.log("gird ref hit")
        //   gridApi.current.setFilterValue(deepCopy(initialFilterValues));
        // }
      }
    
    const columns = bakeColumns(buildColumnSelection(columnOrder), null, null, null)
    const rows = bakeRows(buildColumnSelection(columnOrder), raw_data)

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
                <DataGridPro rows={rows} columns={columns} />
                </div>
        </ThemeProvider>
      </VStack>
    )
}