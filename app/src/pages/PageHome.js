import {useState, useContext} from 'react';
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
  useToast
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

function AddLinkCard() {
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)

  const addArtist = async () => {
    console.log("attempting callable")
    const addArtist = httpsCallable(functions, 'add_artist')
    setLoading(true)
    const resp = await addArtist({spotify_url:url});
    setLoading(false)
    setUrl('')

    if (resp.data.status == 200) {
      toast({
        title: resp.data.added_count + ' artist(s) added!',
        description: "We're running some analysis, the new artist(s) will be available soon.",
        status: 'success',
        duration: 9000,
        isClosable: true,
      })
    } else {
      toast({
        title: 'Failed to add artists',
        description: resp.data.status == 400 ? resp.data.message : "Something went wrong while, try refrshing and add again.",
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
  const [artists, artistsLoading, artistsError] = useCollection(
    query(collection(db, 'artists_v2'), 
      where("ob_status", "==", "onboarded"),
      where("watching", "array-contains", user.org.id)
    ),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )
  const artist_list = artistsError || artistsLoading ? null : artists.docs.map((d) => d.data())

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
            <StatCard title="Total Artists" value={artist_list ? artist_list.length : "-"}></StatCard>
            {/* <StatCard title="Total Unsigned" value={3813}></StatCard>
            <StatCard title="Total Tracked" value={3813}></StatCard> */}
            <AddLinkCard/>
            </Stack>
          </GridItem>
        </Grid>
       
         
        </VStack>
      </PageLayoutContained>
  );
}

export default PageDefault;
