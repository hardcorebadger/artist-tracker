import {useState, useContext, useRef} from 'react';
import {
  Box,
  Text,
  VStack,
  Button,
  Heading,
  Card,
  Stack,
  SimpleGrid,
  SkeletonCircle,
  HStack,
  Icon,
  IconButton,
  filter,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuItemOption,
  MenuGroup,
  MenuOptionGroup,
  MenuDivider,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useDisclosure,
  Checkbox
} from '@chakra-ui/react';
import { PageLayoutContained } from '../layouts/DashboardLayout';
import { Link as RouterLink } from 'react-router-dom';
import { useUser } from '../routing/AuthGuard';
import { AccessSkeleton, AccessOverlay } from '../components/AccessGates';
import Iconify from '../components/Iconify';
import DataTable from 'react-data-table-component';
import { collection, query, where } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../firebase';
import Chart from "react-apexcharts";
import numeral from 'numeral'

const customTableStyles = {
  rows: {
		style: {
			'&:hover': {
        backgroundColor: "#f5f5f5",
				cursor: 'pointer',
			},
		},
	},
}

const miniBarChartOptions = {
chart: {
  type: 'line',
  width: 60,
  height: 10,
  sparkline: {
    enabled: true
  }
},
colors:['#329795'],
stroke: {
  width: 2,
  curve: "smooth"
},
tooltip: {
  fixed: {
    enabled: false
  },
  x: {
    show: false
  },
  y: {
    title: {
      formatter: function (seriesName) {
        return ''
      }
    }
  },
  marker: {
    show: false
  }
}
}


const filterFunctions = {
  "latest": input => input[0],
  "previous": input => input[1],
  "wow": input => (input[0] - input[1]) / input[1],
  "mom": input => (input[0] - input[3]) / input[3],
  "series": input => input.slice().reverse()
}

const metricFunctions = {
  "latest": {
    name: "Latest",
    op: input => input[0],
    colConfig: metric => ({
      format: row => numeral(row[metric][0]).format('0.0a')
    })
  },
  "previous": {
    name: "Previous",
    op: input => input[1],
    colConfig: metric => ({
      format: row => numeral(row[metric][1]).format('0.0a')
    })
  },
  "wow": {
    name: "Week / Week",
    op: input => (input[0] - input[1]) / input[1],
    colConfig: metric => ({
      format: row => numeral((row[metric][0] - row[metric][1]) / row[metric][1]).format('0.00%')
    })
  },
  "mom": {
    name: "Month / Month",
    op: input => (input[0] - input[4]) / input[4],
    colConfig: metric => ({
      format: row => numeral((row[metric][0] - row[metric][4]) / row[metric][4]).format('0.00%')
    })
  },
  "series": {
    name: "Trendline",
    op: input => input[0],
    colConfig: metric => ({
      cell: (row, index) => {
        return <Chart
          options={miniBarChartOptions}
          series={[{
            name: "Streams",
            data: row[metric].slice().reverse()
          }]}
          type="line"
          width="60"
        />
      }
    })
  }
}

const columnOptions = {
  "distro": {
    name: 'Distributor',
    isMetric: false,
    selector: row => row.distro
  },
  "status": {
    name: 'Status',
    isMetric: false,
    selector: row => row.status
  },
  "distro_type": {
    name: 'Distribution Type',
    isMetric: false,
    selector: row => row.distro_type
  },
  "spotify_url": {
    name: 'Spotify URL',
    isMetric: false,
    selector: row => row.spotify_url
  },
  "global_streams": {
    name: 'Global Streams',
    isMetric: true
  },
  "spotify_streams": {
    name: 'Spotify Streams',
    isMetric: true
  }
}

// const availableMetrics = [
//   "global_streams",
//   "us_streams",
//   "ex_us_streams",
//   "spotify_streams",
//   "apple_streams",
//   "tiktok_views",
//   "yt_views",
//   "global_views"
// ]

const metricColumnFactory = (metric, func) => ({
    name: metricFunctions[func].name + " / " + columnOptions[metric].name,
    selector: row => metricFunctions[func].op(row[metric]),
    sortable: true,
    maxWidth: 100,
    ...metricFunctions[func].colConfig(metric)
})

const bakeColumns = (selection) => {
  let columns = [
    {
      name: 'Name',
      selector: row => row.name,
      maxWidth: 300,
      cell: row => {return (<Text fontWeight="bold">{row.name}</Text>)}
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

export default function DataGridController({}) {
  const user = useUser()
  console.log("rerender")

  const { isOpen, onOpen, onClose } = useDisclosure()
  const btnRef = useRef()

  const [artists, artistsLoading, artistsError] = useCollection(
    query(collection(db, 'artists'), 
      where("organizations", "array-contains", user.org.id),
      where("distro_type", "==", "DIY")
    ),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )
  
  const [columnSelection, setColumnSelection] = useState({
    "distro": true,
    "status": true,
    "distro_type": false,
    "spotify_url": true,
    "global_streams": {
      "latest": false,
      "previous": false,
      "wow": false,
      "mom": false,
      "series": false
    },
    "spotify_streams": {
      "latest": false,
      "previous": false,
      "wow": false,
      "mom": false,
      "series": false
    },
  })

  const setColumn = (val, col, sub) => {
    if (columnOptions[col].isMetric) 
      columnSelection[col][sub] = val
    else 
      columnSelection[col] = val
    console.log({...columnSelection})
    setColumnSelection({...columnSelection})
  }

  const columns = bakeColumns(columnSelection)

  const [filters, setFilter] = useState([
    // {
    //   metric: "global_streams",
    //   function: "wow",
    //   op: input => input > 0.8
    // },
    // {
    //   metric: "tiktok_views",
    //   function: "mom",
    //   op: input => input > 0.8
    // },
    // {
    //   metric: "yt_views",
    //   function: "wow",
    //   op: input => input > 0.8
    // }
  ])
  
  // unwrap docs
  let all_data = artistsError || artistsLoading ? null : artists.docs.map((d) => d.data())
  
  // Apply filters
  let filtered = []
  if (all_data) {
    console.log(all_data.length)
    all_data.forEach(d => {
      let flag = true
      filters.forEach(f => {
        if (!f.op(filterFunctions[f.function](d[f.metric]))) {
          flag = false
        }
      })
      if (flag) {
        filtered.push(d)
      }
    })
  }

  const data = all_data ? filtered : []

  return (
    <VStack spacing={5} align="left">
      <Heading px={6} size="md">My screener</Heading> 
      
      <HStack justify="space-between" px={6}>
        
        <HStack spacing={2} align="left">
          <Button size="sm" rightIcon={<Iconify icon="mdi:close" />}>Filter</Button>
          <Button size="sm" rightIcon={<Iconify icon="mdi:close" />}>Filter</Button>
          <Button size="sm" rightIcon={<Iconify icon="mdi:close" />}>Filter</Button>
          <Button size="sm" rightIcon={<Iconify icon="mdi:close" />}>Filter</Button>
          <Button size="sm" rightIcon={<Iconify icon="mdi:close" />}>Filter</Button>
          <Button size="sm" colorScheme='primary' leftIcon={<Iconify icon="mdi:add" />}>Add</Button>
        </HStack>
        
        <Button ref={btnRef} onClick={onOpen} size="sm" leftIcon={<Iconify icon="ph:columns-fill" />}>3</Button>
      </HStack>
      <DataTable
        columns={columns}
        data={data}
        fixedHeader={true}
        fixedHeaderScrollHeight="700px"
        pagination
        paginationComponentOptions={{noRowsPerPage:true}}
        paginationPerPage={15}
        customStyles={customTableStyles}
      />
    <Drawer
      isOpen={isOpen}
      placement='right'
      onClose={onClose}
      finalFocusRef={btnRef}
      customTableStyles={customTableStyles}
    >
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader>Edit Columns</DrawerHeader>

        <DrawerBody  p={4}>
        <VStack spacing={2} textAlign="left">
          {Object.entries(columnOptions).map(([k, v]) => {
            if (v.isMetric) {
              let total_enabled = 0
              Object.keys(columnSelection[k]).forEach(subkey => {
                if (columnSelection[k][subkey])
                  total_enabled++
              })
              return (
                <Box w="100%" p={2} borderRadius="md">
                  <HStack justifyContent="space-between"><Text fontSize="sm">{v.name}</Text>
                  <Menu>
                    <MenuButton colorScheme={total_enabled > 0 ? 'primary' : 'gray'} size="xs" as={Button} rightIcon={<Iconify icon="mdi:caret-down" />}>
                      {total_enabled > 0 ? total_enabled : "-"}
                    </MenuButton>
                    <MenuList>
                      {Object.entries(metricFunctions).map(([mk,mv]) => (
                        <MenuItem key={mk}>
                        <HStack w="100%" justifyContent="space-between"><Text fontSize="sm">{mv.name}</Text><Checkbox colorScheme='primary' isChecked={columnSelection[k][mk]} onChange={e => setColumn(e.target.checked, k, mk)}></Checkbox></HStack>
                        </MenuItem>
                      ))}
                    </MenuList>
                  </Menu>
                  </HStack>
                </Box>
              )
            } else {
              return (
              <Box w="100%" p={2} borderRadius="md" key={k}>
                <HStack justifyContent="space-between"><Text fontSize="sm">{v.name}</Text><Checkbox colorScheme='primary' isChecked={columnSelection[k]} onChange={(e) => setColumn(e.target.checked, k, null)}></Checkbox></HStack>
              </Box>
              )
            }
          })}
          {/* <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">Distributor</Text><Checkbox colorScheme='primary' defaultChecked></Checkbox></HStack>
          </Box>
          <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">Distribution Type</Text><Checkbox colorScheme='primary' defaultChecked></Checkbox></HStack>
          </Box>
          <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">Status</Text><Checkbox colorScheme='primary' defaultChecked></Checkbox></HStack>
          </Box>
          <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">Global Audio Streams</Text>
            <Button colorScheme='primary' size="xs" rightIcon={<Iconify icon="mdi:caret-down" />}>3</Button>
            </HStack>
          </Box>
          <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">TikTok Video Views</Text>
            <Button  size="xs" rightIcon={<Iconify icon="mdi:caret-down" />}>-</Button>
            </HStack>
          </Box>
          <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">US Audio Streams</Text>
            <Button colorScheme='primary' size="xs" rightIcon={<Iconify icon="mdi:caret-down" />}>3</Button>
            </HStack>
          </Box>
          <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">Youtube Video Views</Text>
            <Button  size="xs" rightIcon={<Iconify icon="mdi:caret-down" />}>-</Button>
            </HStack>
          </Box>
          <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">Ex US Audio Streams</Text>
            <Button  size="xs" rightIcon={<Iconify icon="mdi:caret-down" />}>-</Button>
            </HStack>
          </Box>
          <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">Global Video Views</Text>
            <Button  size="xs" rightIcon={<Iconify icon="mdi:caret-down" />}>-</Button>
            </HStack>
          </Box>
          <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">Apple Music Streams</Text>
            <Button  size="xs" rightIcon={<Iconify icon="mdi:caret-down" />}>-</Button>
            </HStack>
          </Box>
          <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">Spotify Streams</Text>
            <Menu>
              <MenuButton size="xs" as={Button} rightIcon={<Iconify icon="mdi:caret-down" />}>
                -
              </MenuButton>
              <MenuList>
                <MenuItem>
                <HStack w="100%" justifyContent="space-between"><Text fontSize="sm">Current</Text><Checkbox colorScheme='primary' defaultChecked></Checkbox></HStack>
                </MenuItem>
                <MenuItem>
                <HStack w="100%" justifyContent="space-between"><Text fontSize="sm">Previous</Text><Checkbox colorScheme='primary' defaultChecked></Checkbox></HStack>
                </MenuItem>
                <MenuItem>
                <HStack w="100%" justifyContent="space-between"><Text fontSize="sm">Week over Week</Text><Checkbox colorScheme='primary' defaultChecked></Checkbox></HStack>
                </MenuItem>
              </MenuList>
            </Menu>
            </HStack>
          </Box> */}
        </VStack>
        </DrawerBody>

        <DrawerFooter>
          <Button variant='outline' mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button colorScheme='primary'>Apply</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
    </VStack>
  );
}