import { Button, HStack, Heading, IconButton, Input, InputGroup, InputRightElement } from "@chakra-ui/react";
import { useState } from "react";
import Iconify from "./Iconify";

export default function EditableTitle({value, setValue}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const save = () => {
    setValue(editValue)
    setEditing(false)
  }
  const clear = () => {
    setEditValue(value)
    setEditing(false)
  }
  const contents = editing ? (
      <Input
      variant='flushed'
      fontSize='xl'
      fontWeight='bold'
      width='auto' 
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      />
  ) : (
    <Heading  size="md">{value}</Heading>
  )
  return (
  <HStack >
    {contents}
    {editing ?
    <HStack>
      <IconButton size='sm' variant="outline" mr={1} onClick={save} icon={<Iconify icon="mdi:check"/>}/>
      <IconButton size='sm' variant="outline" onClick={clear} icon={<Iconify icon="mdi:close"/>}/>
    </HStack>
    :
    <IconButton size='sm' variant="outline" onClick={() => setEditing(true)} icon={<Iconify icon="mdi:edit"/>}/>
    }
  </HStack>
  )

}