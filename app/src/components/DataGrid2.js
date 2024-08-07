import {useState, useContext, useRef, useCallback, useEffect} from 'react';
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
import { collection, doc, query, updateDoc, where } from 'firebase/firestore';
import { useCollectionOnce } from 'react-firebase-hooks/firestore';
import { db } from '../firebase';
import Chart from "react-apexcharts";
import numeral from 'numeral'
import ReactDataGrid from '@inovua/reactdatagrid-community'
import '@inovua/reactdatagrid-community/base.css'
import '@inovua/reactdatagrid-community/theme/blue-light.css'
import DataGridColumnMenu from './DataGridColumnMenu'
import './DataGridStyles.css'
import { columnOptions, metricFunctions, buildColumnSelection } from './DataGridConfig';
import { deepCopy, deepCompare } from '../util/objectUtil';
import EditableTitle from './EditableTitle';
import ConfirmButton from './ConfirmButton';
import { useNavigate } from 'react-router-dom';
import FavoritesButton from './FavoritesButton';

const gridStyle = { minHeight: 'calc(100vh - 173px)' }

const metricColumnFactory = (metric, func) => ({
    name: metric + "-" + func,
    header: columnOptions[metric].header + " (" + metricFunctions[func].header + ")",
    ...metricFunctions[func].options
})

const bakeColumns = (selection, toggleFavs, toggleRowFav, favoritesOnly) => {
  let columns = [
    {
      name: 'favorite',
      header: <FavoritesButton filled={favoritesOnly} sx={{marginBottom:-1}} action={toggleFavs}/>,
      render: row => <FavoritesButton filled={row.value} action={toggleRowFav} data={row.data.id}/>,
      sortable: false,
      draggable: true,
      width: 10,
    },
    {
      name: 'name',
      header: "Artist",
      render: row => <Text color='text.default' fontWeight='semibold'>{row.value}</Text>,
      defaultFlex: 1,
      draggable: true,
      minWidth: 130
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

const bakeRows = (selectedColumns, raw_data, orgId) => {
  let baked_rows = []
  raw_data.forEach(row => {
    let baked_row = {
      name: row['name'],
      favorite: row['watching_details'][orgId]['favorite'],
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

const compareState = (
  initialColumnOrder, columnOrder, 
  initialFilterValues, filterValue
) => {
  return (
  deepCompare(initialColumnOrder, columnOrder) &&
  deepCompare(initialFilterValues, filterValue)
  )
}

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

export default function DataGridController({initialReportName, initialColumnOrder, initialFilterValues, onSave, onSaveNew, onDelete, onOpenArtist}) {
  const user = useUser()
  const navigate = useNavigate()
  // console.log("grid rerender")

  const [artists, artistsLoading, artistsError] = useCollectionOnce(
    query(collection(db, 'artists_v2'), 
      where("ob_status", "==", "onboarded"),
      where("watching", "array-contains", user.org.id)
    )
  )
  
  const [columnOrder, setColumnOrder] = useState(deepCopy(initialColumnOrder))

  const [filterValue, setFilterValue] = useState(deepCopy(initialFilterValues))

  const [reportName, setReportName] = useState(initialReportName)

  const [gridApi, setGridApi] = useState(null)

  const [favoritesOnly, setFavoritesOnly] = useState(false)
  
  const applyColumnSelection = (selection) => {
    console.log(selection)
    setColumnOrder(deepCopy(applyColumnOrder(columnOrder, selection)))
  }

  const revertState = () => {
    setColumnOrder(deepCopy(initialColumnOrder))
    setFilterValue(deepCopy(initialFilterValues))
    setReportName(initialReportName)
    if (gridApi) {
      console.log("gird ref hit")
      gridApi.current.setFilterValue(deepCopy(initialFilterValues));
    }
  }

  const onFavoritesToggled = () => {
    console.log("filter")
    setFavoritesOnly(!favoritesOnly)
  }

  const onRowFavoriteToggled = async (id) => {
    // console.log(id)
    const newData = [...data]
    let update = null
    newData.forEach((d) => {
      if (d.id == id) {
        update = d.raw['watching_details']
        d.favorite = !d.favorite
        update[user.org.id]['favorite'] = d.favorite
        // console.log(d)
      }
    })
    setData(newData)
    // console.log(update)
    if (update != null) {
      await updateDoc(doc(db, 'artists_v2', id), {
        watching_details: update,
      })
    }
  }

  // apply column selection and reformat the rows to match
  const columns = bakeColumns(buildColumnSelection(columnOrder), onFavoritesToggled, onRowFavoriteToggled, favoritesOnly)
  

  const [data, setData] = useState([])
  if (data.length > 0)
    console.log(data[0])
  useEffect(() => {
    const raw_data = artistsError || artistsLoading ? [] : artists.docs.map((d) => d.data())
    setData(bakeRows(buildColumnSelection(columnOrder), raw_data, user.org.id))
  }, [artists]);

  let d = data
  if (favoritesOnly) {
    d = []
    data.forEach((dd) => {
      if (dd.favorite)
        d.push(dd)
    })
  }
  // const data = bakeRows(columnSelection, raw_data, user.org.id)
  const hasBeenEdited = reportName !== initialReportName || !compareState(initialColumnOrder, columnOrder, initialFilterValues, filterValue)
  let bakedColOrder = ['favorite', 'name']
  columnOrder.forEach((col) => {
    bakedColOrder.push(col);
  })
  const setBakedColumnOrder = (colOrder) => {
    colOrder.splice(colOrder.indexOf('name'),1)
    colOrder.splice(colOrder.indexOf('favorite'),1)
    setColumnOrder(colOrder)
  }
  // console.log(columnOrder)
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
        <DataGridColumnMenu currentSelection={buildColumnSelection(columnOrder)} applySelection={applyColumnSelection} />
        {(hasBeenEdited && onSaveNew)&& <Button colorScheme='primary' variant='outline' onClick={revertState}>Revert</Button>}
        {hasBeenEdited&& <Button colorScheme='primary' onClick={() => onSave(columnOrder, filterValue, reportName)}>Save</Button> }
        {(hasBeenEdited && onSaveNew) && <Button colorScheme='primary' onClick={() => onSaveNew(columnOrder, filterValue, reportName)}>Save as New</Button>}
      </HStack>
      
      </HStack>
      <ReactDataGrid
        idProperty="id"
        emptyText={<Spinner thickness='4px' emptyColor='gray.200' color='primary.500' size='xl'/>}
        columns={columns}
        dataSource={d}
        style={gridStyle}
        showColumnMenuTool={false}
        columnOrder={bakedColOrder}
        onColumnOrderChange={setBakedColumnOrder}
        defaultFilterValue={filterValue}
        onReady={setGridApi}
        onFilterValueChange={setFilterValue}
        showCellBorders="horizontal"
        theme='blue-light'
        // onRowClick={onRowClick}
      />
    </VStack>
  );
}