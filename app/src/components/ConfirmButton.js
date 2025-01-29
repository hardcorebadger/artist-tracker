
import { Button, HStack, Heading, IconButton, Input, InputGroup, InputRightElement, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogBackdrop, useDisclosure } from "@chakra-ui/react";
import { cloneElement, isValidElement, useState } from "react";
import Iconify from "./Iconify";
import {DialogCloseTrigger} from "./ui/dialog";

export default function ConfirmButton({button, title, body, affirmative, onAffirm, affirmativeColor='red'}) {
  const { isOpen, onOpen, onClose } = useDisclosure()
  const affirm = () => {
    onClose()
    onAffirm()
  }

  const propedButton = isValidElement(button) ? cloneElement(button, { onClick:onOpen} ) : button;
  return (
    <>
      {propedButton}
      <Dialog isOpen={isOpen} onClose={onClose}>
        <DialogBackdrop />
        <DialogContent>
          <DialogHeader>{title}</DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            {body}
          </DialogBody>

          <DialogFooter>
            <Button colorScheme={affirmativeColor} mr={3} onClick={affirm}>
              {affirmative}
            </Button>
            <Button variant='ghost' onClick={onClose}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )

}