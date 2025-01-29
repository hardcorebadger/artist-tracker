import {useContext, useEffect, useState} from "react";
import {ColumnDataContext, goFetch} from "../App";
import {
    Avatar,
    Box, Button,
    Text
} from "@chakra-ui/react";
import {
    AutoComplete, AutoCompleteCreatable,
    AutoCompleteInput,
    AutoCompleteItem,
    AutoCompleteList,
    AutoCompleteTag
} from "@choc-ui/chakra-autocomplete";
import TagInput from "./TagInput";
import {httpsCallable} from "firebase/functions";
import {functions} from "../firebase";
import {useUser} from "../routing/AuthGuard";
import {Dialog} from "@chakra-ui/icons";
import {DialogBackdrop, DialogBody, DialogCloseTrigger, DialogContent, DialogFooter, DialogHeader} from "./ui/dialog";

export default
function ChangeOrganizationModal({currentUser, organizations, onOpen, onClose, isOpen}) {

    const user = useUser()

    const currentOrganization = organizations?.find((org) => org.id == currentUser?.organization)

    const onSelectOrganization = (item) => {
        if (item.item.value !== currentUser?.organization) {
            goFetch(user, 'POST','set-organization', {organization: item.item.value}).then(response => {
                window.location.reload()
            })
        }
    }

    return (

        <Dialog onClose={onClose} isOpen={isOpen} isCentered>
            <DialogBackdrop />
            <DialogContent>
                <DialogHeader>Change Organization</DialogHeader>
                <DialogCloseTrigger/>
                <DialogBody>
                    <Box sx={{display:'flex', width: '100%', alignItems:'center'}} mb={2}>
                        <Text fontWeight={'bold'}>Current: {currentOrganization?.name}</Text>
                    </Box>
                    <AutoComplete defaultIsOpen={true} onSelectOption={onSelectOrganization} >
                        <AutoCompleteInput variant="subtle" />
                        <AutoCompleteList>
                            {organizations?.map((org) => (
                                <AutoCompleteItem
                                    key={`option-${org.id}`}
                                    value={org.id}
                                    label={org.name}
                                    textTransform="capitalize"
                                >
                                    {org.name}
                                </AutoCompleteItem>
                            ))}
                        </AutoCompleteList>
                    </AutoComplete>

                </DialogBody>
                <DialogFooter>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
