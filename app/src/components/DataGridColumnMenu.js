import {useState, useRef} from 'react';
import {
  Box,
  Text,
  VStack,
  Button,
  HStack,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerContent,
  useDisclosure,
  Checkbox
} from '@chakra-ui/react';
import Iconify from '../components/Iconify';
import MenuMiniList from "./MenuMiniList";
import MenuMiniListItem from "./MenuMiniListItem";
import { deepCopy } from '../util/objectUtil';
import {DrawerBackdrop, DrawerCloseTrigger} from "./ui/drawer";


export default function DatGridColumnMenu({columnOptions, columnOrder, setColumnOrder}) {

  const { isOpen, onOpen, onClose } = useDisclosure()
  const btnRef = useRef()
  
  const [internalColumnOrder, setInternalColumnOrder] = useState(columnOrder) 

  const controlledOpen = () => {
    setInternalColumnOrder(deepCopy(columnOrder))
    onOpen()
  }

  const applyAndClose = () => {
    setColumnOrder(deepCopy(internalColumnOrder))
    onClose()
  }

  const cancelAndClose = () => {
    setInternalColumnOrder(deepCopy(columnOrder))
    onClose()
  }

  const toggleColumn = (key, val) => {
    if (internalColumnOrder.indexOf(key) !== -1 && !val) {
      setInternalColumnOrder(internalColumnOrder.filter((k) => k !== key))
    } else if (internalColumnOrder.indexOf(key) === -1 && val) {
      setInternalColumnOrder([...internalColumnOrder, key])
    }
  }

  const countPrefixOccurrences = (prefix) => {
    let count = 0
    internalColumnOrder.forEach(key => {
      if (key.startsWith(prefix)) {
        count++
      }
    })
    return count
  }

  return (
    <>
      <Button ref={btnRef} onClick={controlledOpen} leftIcon={<Iconify icon="ph:columns-fill" />}>Columns ({columnOrder?.length})</Button>
      <Drawer
        isOpen={isOpen}
        placement='right'
        onClose={cancelAndClose}
        finalFocusRef={btnRef}
      >
        <DrawerBackdrop />
        <DrawerContent>
        <DrawerCloseTrigger />
        <DrawerHeader>Edit Columns</DrawerHeader>
        {isOpen &&
        <DrawerBody  p={4}>
        <VStack spacing={2} textAlign="left">
          {columnOptions.map((option) => {
            if (option.type == "dropdown") {
              return (
              <MenuMiniList
                  key={option.key}
                  title={option.display}
                  totalEnabled={countPrefixOccurrences(option.key)}
                  items={option.children.map((sub) => {
                    return (
                        <MenuMiniListItem
                            itemKey={sub.key}
                            title={sub.display}
                            isChecked={internalColumnOrder?.indexOf(sub.key) !== -1}
                            toggle={toggleColumn}
                        />
                    )
                  })}
              />
              )
            }
            else {
              return (
              <Box w="100%" p={2} borderRadius="md" key={option.key}>
                <HStack justifyContent="space-between"><Text fontSize="sm">{option.display}</Text><Checkbox
                    colorScheme='primary' isChecked={internalColumnOrder?.indexOf(option.key) !== -1}
                    onChange={(e) => toggleColumn(option.key, e.target.checked)}></Checkbox></HStack>
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