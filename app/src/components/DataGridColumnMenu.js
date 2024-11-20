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
import { columnOptions, metricFunctions } from './DataGridConfig';
import MenuMiniList from "./MenuMiniList";
import MenuMiniListItem from "./MenuMiniListItem";

const countColumns = (selection) => {
  let count = 0
  Object.keys(selection).forEach(key => {
    if (key === 'link') {
      Object.keys(selection[key]).forEach(linkSource => {
        if (selection[key][linkSource] !== -1 && selection[key][linkSource] !== false) {
          count++
        }
      })
    } else
    if (columnOptions[key].isMetric) {
      Object.keys(selection[key]).forEach(subkey => {
        if (selection[key][subkey] !== false && selection[key][subkey] !== -1) {
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

export default function DatGridColumnMenu({currentSelection, applySelection}) {

  const { isOpen, onOpen, onClose } = useDisclosure()
  const btnRef = useRef()
  
  const [columnSelection, setColumnSelection] = useState({'link': {}})

  const setColumn = (val, col, sub) => {
    if (col === 'link') {
       columnSelection['link'][sub] = val
    } else
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
  let total_social_links_enabled = 0;
  let total_links_enabled = 0
  Object.keys(columnSelection['link']).forEach(subkey => {
    if (columnSelection['link'][subkey]) {
      if (!columnOptions['link_' + subkey].social) {
        total_links_enabled++
      } else {
        total_social_links_enabled ++;
      }
    }
  })

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
              if (!columnOptions[k].isMetric && !v.field?.startsWith('link')) {
                return (
                    <Box w="100%" p={2} borderRadius="md" key={k}>
                      <HStack justifyContent="space-between"><Text fontSize="sm">{v.headerName}</Text><Checkbox
                          colorScheme='primary' isChecked={columnSelection[k]}
                          onChange={(e) => setColumn(e.target.checked, k, null)}></Checkbox></HStack>
                    </Box>
                )
              }
            })}
            <MenuMiniList
                key={'link'}
                title={'Links'}
                totalEnabled={total_links_enabled}
                items={Object.entries(currentSelection['link']).map(([lk,lv]) => {
                  if (columnOptions["link_" + lk].social) {
                    return null;
                  }
                  return (
                      <MenuMiniListItem
                          key={"link_"+lk}
                          parentKey={"link"}
                          subKey={lk}
                          title={columnOptions["link_" + lk].headerName}
                          columnSelection={columnSelection}
                          setColumn={setColumn}
                      />
                  )
                })}
            />
            <MenuMiniList
              key={'social_link'}
              title={'Social Links'}
              totalEnabled={total_social_links_enabled}
              items={Object.entries(currentSelection['link']).map(([lk,lv]) => {
                if (!columnOptions["link_" + lk].social) {
                  return null;
                }
                return (
                    <MenuMiniListItem
                        key={"link_"+lk}
                        parentKey={"link"}
                        subKey={lk}
                        title={columnOptions["link_" + lk].headerName}
                        columnSelection={columnSelection}
                        setColumn={setColumn}
                    />
                )
              })}
            />
            {Object.entries(columnOptions).map(([k, v]) => {

              if (v.isMetric) {
                let total_enabled = 0
                Object.keys(columnSelection[k]).forEach(subkey => {
                  if (columnSelection[k][subkey])
                    total_enabled++
                })
                return (
                  <Box w="100%" p={2} borderRadius="md" key={k}>
                    <HStack justifyContent="space-between"><Text fontSize="sm">{v.headerName}</Text>
                    <Menu>
                      <MenuButton colorScheme={total_enabled > 0 ? 'primary' : 'gray'} size="xs" as={Button} rightIcon={<Iconify icon="mdi:caret-down" />}>
                        {total_enabled > 0 ? total_enabled : "-"}
                      </MenuButton>
                      <MenuList>
                        {Object.entries(metricFunctions).map(([mk,mv]) => (
                          <MenuItem key={mk}>
                          <HStack w="100%" justifyContent="space-between"><Text fontSize="sm">{mv.headerName}</Text><Checkbox colorScheme='primary' isChecked={columnSelection[k][mk]} onChange={e => setColumn(e.target.checked, k, mk)}></Checkbox></HStack>
                          </MenuItem>
                        ))}
                      </MenuList>
                    </Menu>
                    </HStack>
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