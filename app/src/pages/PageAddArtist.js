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
  TableContainer,
  Table,
  TableCaption,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  Tfoot,
  HStack,
  Input,
} from '@chakra-ui/react';
import { PageLayoutContained } from '../layouts/DashboardLayout';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useUser } from '../routing/AuthGuard';
import { AccessSkeleton, AccessOverlay } from '../components/AccessGates';
import Iconify from '../components/Iconify';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../firebase';
import { collection, query, where } from 'firebase/firestore';
import { Link as ReactRouterLink } from 'react-router-dom'
import { format } from "date-fns"

function PageAddArtist() {

  const user = useUser()
  const navigate = useNavigate()
  const [reports, reportsLoading, reportError] = useCollection(
    query(collection(db, 'reports'), 
      where("organization", "==", user.org.id),
    ),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )

  const reportItems = reportError || reportsLoading ? null : reports.docs.map((d) => ({'name': d.data().name, 'creator':'wh@thehoops.co', 'last_modified':new Date(), 'path': '/app/reports/'+d.id}))


  return (
      <PageLayoutContained size="md">
        <VStack spacing={10} align="left">
        <VStack spacing={5} align="left">
        <Heading size="lg">Add Artists</Heading>
        <Heading size="sm">Scrape a Playlist</Heading>
        <Text>Ingest all artists on a playlist, save whoever is unsigned</Text>
        <HStack justifyContent='space-between'>
        <Input placeholder='Spotify Playlist URL'></Input>
        <Button colorScheme='primary' as={ReactRouterLink} to='/app/reports/new'>Scrape Playlist</Button>
        </HStack>
        <Heading size="sm">Add an Artist Manually</Heading>
        <Text>To add a new artist manually, just paste their Spotify link below and click add.</Text>
        <HStack justifyContent='space-between'>
        <Input placeholder='Spotify URL'></Input>
        <Button colorScheme='primary' as={ReactRouterLink} to='/app/reports/new'>Add Artist</Button>
        </HStack>
        </VStack>
        </VStack>
      </PageLayoutContained>
  );
}

export default PageAddArtist;
