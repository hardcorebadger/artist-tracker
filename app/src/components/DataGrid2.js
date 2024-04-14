import {useState, useContext, useRef, useCallback} from 'react';
import {
  Box,
  Text,
  VStack,
  Heading,
  Badge,
  Link,
  HStack,
  Button,
  IconButton,
  filter,
  Spinner,
} from '@chakra-ui/react';
import { useUser } from '../routing/AuthGuard';
import Iconify from '../components/Iconify';
import DataTable from 'react-data-table-component';
import { collection, query, where } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../firebase';
import Chart from "react-apexcharts";
import numeral from 'numeral'
import ReactDataGrid from '@inovua/reactdatagrid-community'
import '@inovua/reactdatagrid-community/base.css'
import '@inovua/reactdatagrid-community/theme/blue-light.css'
import DataGridColumnMenu from './DataGridColumnMenu'
import './DataGridStyles.css'
import { columnOptions, metricFunctions } from './DataGridConfig';
import { deepCopy, deepCompare } from '../util/objectUtil';
import EditableTitle from './EditableTitle';
import ConfirmButton from './ConfirmButton';
import { useNavigate } from 'react-router-dom';

const gridStyle = { minHeight: 'calc(100vh - 173px)' }

const metricColumnFactory = (metric, func) => ({
    name: metric + "-" + func,
    header: columnOptions[metric].header + " (" + metricFunctions[func].header + ")",
    ...metricFunctions[func].options
})

const bakeColumns = (selection) => {
  let columns = [
    {
      name: 'name',
      header: "Artist",
      render: row => <Text color='text.default' fontWeight='semibold'>{row.value}</Text>,
      defaultFlex: 1
      // maxWidth: 300,
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
  return columns
}

const bakeRows = (selectedColumns, raw_data) => {
  let baked_rows = []
  raw_data.forEach(row => {
    let baked_row = {
      name: row['name']
    }
    Object.keys(selectedColumns).forEach(key => {
      if (columnOptions[key].isMetric) {
        Object.keys(selectedColumns[key]).forEach(subkey => {
          if (selectedColumns[key][subkey]) {
            baked_row[key+"-"+subkey] = metricFunctions[subkey].op(row[key])
          }
        })
      } else {
        if (selectedColumns[key])
          baked_row[key] = row[key]
          // columns.push(columnOptions[key])
      }
    })
    baked_rows.push(baked_row)
  })
  return baked_rows
}

const compareState = (
  initialColumnSelection, columnSelection, 
  initialColumnOrder, columnOrder, 
  initialFilterValues, filterValue
) => {
  return (
  deepCompare(initialColumnSelection, columnSelection) && 
  deepCompare(initialColumnOrder, columnOrder) &&
  deepCompare(initialFilterValues, filterValue)
  )
}

const applyColumnOrder = (currentOrder, selectedColumns) => {
  if (!currentOrder.includes('name')) {
    currentOrder.push('name')
  }
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

export default function DataGridController({initialReportName, initialColumnSelection, initialColumnOrder, initialFilterValues, onSave, onSaveNew, onDelete, onOpenArtist}) {
  const user = useUser()
  const navigate = useNavigate()
  console.log("grid rerender")

  const [artists, artistsLoading, artistsError] = useCollection(
    query(collection(db, 'artists'), 
      where("organizations", "array-contains", user.org.id),
      // where("distro_type", "==", "DIY")
    ),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )
  
  const [columnSelection, setColumnSelection] = useState(deepCopy(initialColumnSelection))

  const [columnOrder, setColumnOrder] = useState(deepCopy(initialColumnOrder))

  const [filterValue, setFilterValue] = useState(deepCopy(initialFilterValues))

  const [reportName, setReportName] = useState(initialReportName)

  const [gridApi, setGridApi] = useState(null)
  
  const applyColumnSelection = (selection) => {
    setColumnSelection(selection)
    setColumnOrder(applyColumnOrder(columnOrder, selection))
  }

  const revertState = () => {
    setColumnSelection(deepCopy(initialColumnSelection))
    setColumnOrder(deepCopy(initialColumnOrder))
    setFilterValue(deepCopy(initialFilterValues))
    setReportName(initialReportName)
    if (gridApi) {
      console.log("gird ref hit")
      gridApi.current.setFilterValue(deepCopy(initialFilterValues));
    }
  }

  // apply column selection and reformat the rows to match
  const columns = bakeColumns(columnSelection)
  const raw_data = artistsError || artistsLoading ? [] : artists.docs.map((d) => d.data())
  const data = bakeRows(columnSelection, raw_data)
  const hasBeenEdited = reportName !== initialReportName || !compareState(initialColumnSelection, columnSelection, initialColumnOrder, columnOrder, initialFilterValues, filterValue)
  
  const onRowClick = useCallback((rowProps, event) => {
    // with real data we need the ID in here
    const id = rowProps.data.spotify_url.split('/')[rowProps.data.spotify_url.split('/').length - 1]
    onOpenArtist(id)
    // navigate('/app/artists/'+id)
  }, [])

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
        <DataGridColumnMenu currentSelection={columnSelection} applySelection={applyColumnSelection} />
        {(hasBeenEdited && onSaveNew)&& <Button colorScheme='primary' variant='outline' onClick={revertState}>Revert</Button>}
        {hasBeenEdited&& <Button colorScheme='primary' onClick={() => onSave(columnSelection, columnOrder, filterValue, reportName)}>Save</Button> }
        {(hasBeenEdited && onSaveNew) && <Button colorScheme='primary' onClick={() => onSaveNew(columnSelection, columnOrder, filterValue, reportName)}>Save as New</Button>}
      </HStack>
      
      </HStack>
      <ReactDataGrid
        idProperty="id"
        emptyText={<Spinner thickness='4px' emptyColor='gray.200' color='primary.500' size='xl'/>}
        columns={columns}
        dataSource={data}
        style={gridStyle}
        showColumnMenuTool={false}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        defaultFilterValue={filterValue}
        onReady={setGridApi}
        onFilterValueChange={setFilterValue}
        showCellBorders="horizontal"
        theme='blue-light'
        onRowClick={onRowClick}
      />
    </VStack>
  );
}