import { Button, HStack, Heading, IconButton, Input, InputGroup, InputRightElement, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, useDisclosure } from "@chakra-ui/react";
import { cloneElement, isValidElement, useState } from "react";
import Iconify from "./Iconify";

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
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{title}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {body}
          </ModalBody>

          <ModalFooter>
            <Button colorScheme={affirmativeColor} mr={3} onClick={affirm}>
              {affirmative}
            </Button>
            <Button variant='ghost' onClick={onClose}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )

}