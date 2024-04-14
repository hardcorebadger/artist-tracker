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
} from '@chakra-ui/react';
import { PageLayoutContained } from '../layouts/DashboardLayout';
import { Link as RouterLink } from 'react-router-dom';
import { useUser } from '../routing/AuthGuard';
import { AccessSkeleton, AccessOverlay } from '../components/AccessGates';
import Iconify from '../components/Iconify';
import ReportsList from '../components/ReportsList';

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
  return (
    <Card p={25}>
      <Stack w="100%" spacing={3}>
        <Heading size="xs">Add Artists</Heading>
        <Text>Paste an artist or playlist link from Spotify to add artists to your tracker</Text>
        <Input placeholder='Spotify Link'/>
        <Button>Add Artist or Playlist</Button>
      </Stack>
    </Card>
  )
}

function PageArtist() {
  const user = useUser()

  return (
      <PageLayoutContained size="lg">
        <VStack spacing={10} align="left">
          <Heading>Dashboard</Heading>
          <Grid templateColumns='repeat(4, 1fr)' gap={5}>
          <GridItem colSpan={3}>
            <ReportsList />
          </GridItem>
          <GridItem colSpan={1}>
            <Stack>
            <StatCard title="Total Artists" value={4982}></StatCard>
            <StatCard title="Total Unsigned" value={3813}></StatCard>
            <StatCard title="Total Tracked" value={3813}></StatCard>
            <AddLinkCard/>
            </Stack>
          </GridItem>
        </Grid>
       
         
        </VStack>
      </PageLayoutContained>
  );
}

export default PageArtist;
