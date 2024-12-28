import {useState, useContext, useEffect} from 'react';
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
  Grid,
  GridItem,
  Input,
  useToast,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  WrapItem, Wrap, Avatar, Flex, FormHelperText, FormLabel, FormControl
} from '@chakra-ui/react';
import { PageLayoutContained } from '../layouts/DashboardLayout';
import { Link as RouterLink } from 'react-router-dom';
import { useUser } from '../routing/AuthGuard';
import { AccessSkeleton, AccessOverlay } from '../components/AccessGates';
import Iconify from '../components/Iconify';
import ReportsList from '../components/ReportsList';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { collection, query, where } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../firebase';
import {
  AutoComplete, AutoCompleteCreatable,
  AutoCompleteInput,
  AutoCompleteItem,
  AutoCompleteList,
  AutoCompleteTag
} from "@choc-ui/chakra-autocomplete";
import {ColumnDataContext, goFetch} from "../App";
import TagInput from "../components/TagInput";

function StatCard({title, value}) {
  return (
    <Card p={25}>
      <Stack w="100%" spacing={3}>
        <Heading size="xs">{title}</Heading>
        <Heading>{value}</Heading>
      </Stack>
    </Card>
  )
}

function AddTagsModal({addPreview, setAddPreview, isOpen, onOpen, onClose}) {
  const [selectedTags, setSelectedTags] = useState([]);
  const [loading, setLoading] = useState(false)
  const toast = useToast();
  const {refreshFilters} = useContext(ColumnDataContext)

  const addArtistURL = async () => {
    console.log("attempting callable")
    setLoading(true);
    const user = useUser()
    const addArtist = httpsCallable(functions, 'add_artist')
    const resp = await addArtist({spotify_url:addPreview?.url, tags:selectedTags});
    console.log(resp.data)
    setLoading(false)
    if (resp.data.status === 200) {
      setAddPreview(null)
      refreshFilters(user)
      onClose()
      toast({
        title: resp.data.added_count + ' artist(s) added!',
        description: "We're running some analysis, the new artist(s) will be available soon.",
        status: 'success',
        duration: 9000,
        isClosable: true,
      })
    } else {
      setAddPreview(null)
      onClose()
      toast({
        title: 'Failed to add artists',
        description: resp.data.status == 400 ? resp.data.message : "Something went wrong while adding, try refrshing and add again.",
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
            <ModalHeader>{addPreview?.type === 'artist' ? "Import Artist" : "Scrape Playlist"}</ModalHeader>
            <ModalCloseButton onClick={onClose} />
            <ModalBody>
              <Box sx={{display:'flex', width: '100%', alignItems:'center'}} mb={2}>
                <Avatar size={'lg'} borderRadius={2} name={addPreview?.name}  src={addPreview?.avatar}/>
                <Box p={2}>
                  <Text fontWeight={'bold'}>{addPreview?.name}</Text>
                  <Text fontSize={'11px'} color={'text.subtitle'}>{addPreview?.url}</Text>
                </Box>
              </Box>
              <TagInput disabled={loading} initialTags={[]} setSelectedTags={setSelectedTags}/>

            </ModalBody>
            <ModalFooter>
              <Button width={'100%'} disabled={loading} onClick={addArtistURL}>{addPreview?.type === 'artist' ? "Import Artist" : "Scrape Playlist"}</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
  )
}

function AddLinkCard({setAddPreview, onOpen}) {
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const addArtist = async () => {
    console.log("attempting callable")
    const addArtist = httpsCallable(functions, 'add_artist')
    setLoading(true)
    const resp = await addArtist({spotify_url:url, preview: true});
    setLoading(false)
    setUrl('')
    console.log(resp.data)

    if (resp.data.found) {
      setAddPreview(resp.data)
      onOpen()
    } else {
      toast({
        title: 'Failed to find artist or playlist',
        description: resp.data?.found === false ? "Make sure to get the URL directly from Spotify" : "Something went wrong",
        status: 'error',
        duration: 9000,
        isClosable: true,
      })
    }
  }
  return (
    <Card p={25}>
      <Stack w="100%" spacing={3}>
        <Heading size="xs">Add Artists</Heading>
        <Text>Paste an artist or playlist link from Spotify to add artists to your tracker</Text>
        <Input isDisabled={loading} placeholder='Spotify Link' value={url} onChange={(e) => setUrl(e.target.value)}/>
        <Button isLoading={loading} onClick={addArtist} isDisabled={url == ''} colorScheme='primary'>Add Artist or Playlist</Button>
      </Stack>
    </Card>
  )
}

function PageDefault() {
  const user = useUser()
  const [artistCount, setArtistCount] = useState(null)
  const [addPreview, setAddPreview] = useState(null);
  const getArtists = (data) => {
    return goFetch(user, 'GET', 'artists', data)
  }
  const { isOpen, onOpen, onClose } = useDisclosure()

  useEffect( () => {
    const loadArtists = async () => {
      const resp = await getArtists({page: 0});
      console.log(resp)
      setArtistCount(resp?.rowCount ?? null)
    }
    loadArtists()
  }, []);

  return (
      <PageLayoutContained size="lg">
        <VStack spacing={10} align="left">
          <VStack spacing={2} align="left">
            <Heading size="sm">{user.org.info.name}'s Dashboard</Heading>
          </VStack>
          <Grid templateColumns='repeat(4, 1fr)' gap={5}>
          <GridItem colSpan={3}>
            <ReportsList />
          </GridItem>
          <GridItem colSpan={1}>
            <Stack>
            <StatCard title="Total Artists" value={artistCount ? artistCount : "-"}></StatCard>
            {/* <StatCard title="Total Unsigned" value={3813}></StatCard>
            <StatCard title="Total Tracked" value={3813}></StatCard> */}
            <AddLinkCard setAddPreview={setAddPreview} onOpen={onOpen}/>
            </Stack>
          </GridItem>
            <AddTagsModal
              isOpen={isOpen}
              onOpen={onOpen}
              onClose={onClose}
              addPreview={addPreview}
              setAddPreview={setAddPreview}
            />
        </Grid>
       
         
        </VStack>
      </PageLayoutContained>
  );
}

export default PageDefault;
