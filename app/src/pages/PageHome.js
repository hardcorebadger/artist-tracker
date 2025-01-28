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
  WrapItem, Wrap, Avatar, Flex, FormHelperText, FormLabel, FormControl, Link, useColorMode
} from '@chakra-ui/react';
import { PageLayoutContained } from '../layouts/DashboardLayout';
import { Link as RouterLink } from 'react-router-dom';
import { useUser } from '../routing/AuthGuard';
import { AccessSkeleton, AccessOverlay } from '../components/AccessGates';
import Iconify from '../components/Iconify';
import ReportsList from '../components/ReportsList';
import { httpsCallable } from 'firebase/functions';
import {functions, spotify_redirect} from '../firebase';
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
import {LoadingWidget} from "../routing/LoadingScreen";
const client_id = 'aa08e3eb52f24d9a9f772e2c544b39b5';
const scope = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read user-read-recently-played';

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
  const user = useUser()

  const addArtistURL = async () => {
    console.log("attempting callable add")
    setLoading(true);
    const addArtist = (body) => {
      return goFetch(user, 'POST', 'add-artist', body)
    }
    const resp = await addArtist({spotify_url:addPreview?.url, tags:selectedTags});
    console.log(resp)
    setLoading(false)
    if (resp.status === 200) {
      setAddPreview(null)
      refreshFilters(user)
      onClose()
      toast({
        title: resp.added_count + ' artist(s) added!',
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
        description: resp.status == 400 ? resp.message : "Something went wrong while adding, try refrshing and add again.",
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
  const user = useUser()

  const addArtist = async () => {
    console.log("attempting callable")
    const addArtist = (body) => {
      return goFetch(user, 'POST', 'add-artist', body)
    }
    setLoading(true)
    const resp = await addArtist({spotify_url:url, preview: true});
    setLoading(false)
    setUrl('')
    console.log(resp)
    const type = (resp?.type ?? null)
    if (resp.found) {
      setAddPreview(resp)
      onOpen()
    } else {
      toast({
        title: 'Failed to find ' + (type === 'playlist' ? 'playlist' : (type === 'artist' ? 'artist' : 'artist or playlist')),
        description: resp?.found === false ? (type === 'playlist' ? "Make sure it is a standard public playlist on your account" : "Make sure to get the URL directly from Spotify") : "Something went wrong",
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
  const {users} = useContext(ColumnDataContext)

  useEffect( () => {
    const loadArtists = async () => {
      const resp = await getArtists({page: 0});
      console.log(resp)
      setArtistCount(resp?.rowCount ?? null)
    }
    loadArtists()
  }, []);
  const state = user.auth.uid + ( new Date/1000 | 0);
  const spotifyParams = new URLSearchParams({
    response_type: 'code',
    client_id: client_id,
    scope: scope,
    redirect_uri: spotify_redirect,
    state: state
  });


  return (
      <PageLayoutContained size="lg">
        <VStack spacing={10} align="left" sx={{maxWidth: 'calc(100vw - 60px )'}}>
          <VStack spacing={2} align="left">
            <Heading size="sm">{user.org.info.name}'s Dashboard</Heading>
          </VStack>
          <Grid templateColumns={{base: 'repeat(1fr)', md: 'repeat(4, 1fr)'}} gap={5}>
          <GridItem colSpan={{base: 1, md: 3}}>
            <Box sx={{maxWidth: 'calc(100vw - 60px )', overflowX:'scroll'}}>

              {(users !== null) ? (<ReportsList/>) : <LoadingWidget height={'50vh'}/>}
            </Box>
          </GridItem>
          <GridItem colSpan={1}>
            <Stack>
            <StatCard title="Total Artists" value={artistCount ? artistCount : "-"}></StatCard>
            {/* <StatCard title="Total Unsigned" value={3813}></StatCard>
            <StatCard title="Total Tracked" value={3813}></StatCard> */}
            <AddLinkCard setAddPreview={setAddPreview} onOpen={onOpen}/>
              <Card p={25}>
                <Stack w="100%" spacing={3}>
                  <Heading size="xs">Text Us</Heading>
                  <Text>Send in artist or playlist links to import or get information on your phone.{(user?.profile?.sms?.verified ? ' Send HELP for instructions.' : '')}</Text>

                  <Link href={user?.profile?.sms?.verified ? 'sms:+18333712184' : '/app/settings/account'} isExternal={user?.profile?.sms?.verified ?? false}><Button colorScheme='primary'>{user?.profile?.sms?.verified ? 'Text +1 833 371-2184' : 'Get Started'}</Button></Link>
                </Stack>
              </Card>
              {/*<Card p={25}>*/}
              {/*  <Stack w="100%" spacing={3}>*/}
              {/*    <Heading size="xs">Spotify</Heading>*/}
              {/*    <Text></Text>*/}

              {/*    <Link href={'https://accounts.spotify.com/authorize?'+spotifyParams.toString()} isExternal={true}><Button colorScheme='primary'>Link</Button></Link>*/}
              {/*  </Stack>*/}
              {/*</Card>*/}
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
