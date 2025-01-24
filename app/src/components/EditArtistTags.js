import {useContext, useEffect, useState} from "react";
import {ColumnDataContext, goFetch} from "../App";
import {
    Avatar,
    Box, Button,
    FormControl,
    FormLabel,
    Modal, ModalBody,
    ModalCloseButton,
    ModalContent, ModalFooter,
    ModalHeader,
    ModalOverlay, Text, useToast, VStack
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

export default
function ArtistTagsModal({artist, onTagSave, onClose, onOpen, isOpen}) {
    const [selectedTags, setSelectedTags] = useState([]);
    const [loading, setLoading] = useState(false)
    const toast = useToast();
    const {refreshFilters} = useContext(ColumnDataContext)
    const user = useUser()

    useEffect(() => {
        setLoading(false)
        setSelectedTags([])
    }, [])

    const setTags = async () => {
        console.log("attempting callable")
        setLoading(true);
        try {
            const addArtist = (body) => {
                return goFetch(user, 'POST', 'add-artist', body)
            }
            console.log(selectedTags)
            const resp = await addArtist({id: artist?.id, tags: selectedTags ?? []});
            console.log(resp)
            setLoading(false)
            if (resp.status === 200) {
                onTagSave()
                refreshFilters(user)
                onClose()
                toast({
                    title: 'Tags saved!',
                    description: "Your tags were saved to the artist.",
                    status: 'success',
                    duration: 9000,
                    isClosable: true,
                })
            } else {
                setLoading(false)
                onClose()
                toast({
                    title: 'Failed to save artist tags.',
                    description: resp.status == 400 ? resp.data.message : "Something went wrong while saving, try refreshing and add again.",
                    status: 'error',
                    duration: 9000,
                    isClosable: true,
                })
            }
        } catch (e) {
            setLoading(false)
            onClose()
            toast({
                title: 'Failed to save artist tags.',
                description: resp.status == 400 ? resp.message : "Something went wrong while saving, try refreshing and add again.",
                status: 'error',
                duration: 9000,
                isClosable: true,
            })
        }
    }
    return (

        <Modal onClose={onClose} isOpen={isOpen} isCentered>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Edit Tags</ModalHeader>
                <ModalCloseButton onClick={onClose} />
                <ModalBody>
                    <Box sx={{display:'flex', width: '100%', alignItems:'center'}} mb={2}>
                        <Avatar size={'lg'} borderRadius={2} name={artist?.name}  src={artist?.avatar}/>
                        <Box p={2}>
                            <Text fontWeight={'bold'}>{artist?.name}</Text>
                        </Box>
                    </Box>
                    <TagInput disabled={loading} initialTags={artist?.tags.map((tag) => tag.tag)} setSelectedTags={setSelectedTags}/>


                </ModalBody>
                <ModalFooter>
                    <VStack sx={{width: '100%'}}>

                        <Button width={'100%'} disabled={loading} onClick={onClose}>{"Cancel"}</Button>

                        <Button width={'100%'} disabled={loading} onClick={setTags}>{"Save Tags"}</Button>
                    </VStack>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
