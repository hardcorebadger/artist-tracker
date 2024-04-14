import {useState, useRef} from 'react';
import {
  Box,
  Text,
  VStack,
  Button,
  HStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
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
import Iconify from '../components/Iconify';
import Chart from "react-apexcharts";
import numeral from 'numeral'


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

const countColumns = (selection) => {
  let count = 0
  Object.keys(selection).forEach(key => {
    if (columnOptions[key].isMetric) {
      Object.keys(selection[key]).forEach(subkey => {
        if (selection[key][subkey]) {
          count++
        }
      })
    } else {
      if (selection[key])
        count++
    }
  })
  return count
}

export default function DataGridController({currentSelection, applySelection}) {

  const { isOpen, onOpen, onClose } = useDisclosure()
  const btnRef = useRef()
  
  const [columnSelection, setColumnSelection] = useState({})

  const setColumn = (val, col, sub) => {
    if (columnOptions[col].isMetric) 
      columnSelection[col][sub] = val
    else 
      columnSelection[col] = val
    setColumnSelection({...columnSelection})
  }

  const controlledOpen = () => {
    setColumnSelection({...currentSelection})
    onOpen()
  }

  const applyAndClose = () => {
    applySelection({...columnSelection})
    onClose()
  }

  const cancelAndClose = () => {
    setColumnSelection({...currentSelection})
    onClose()
  }

  return (
    <>
      <Button ref={btnRef} onClick={controlledOpen} leftIcon={<Iconify icon="ph:columns-fill" />}>Columns ({countColumns(currentSelection)})</Button>
      <Drawer
        isOpen={isOpen}
        placement='right'
        onClose={cancelAndClose}
        finalFocusRef={btnRef}
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>Edit Columns</DrawerHeader>
          {isOpen &&
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
                  <Box w="100%" p={2} borderRadius="md" key={k}>
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
          </VStack>
          </DrawerBody>
          }
          <DrawerFooter>
            <Button variant='outline' mr={3} onClick={cancelAndClose}>
              Cancel
            </Button>
            <Button colorScheme='primary' onClick={applyAndClose}>Apply</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}