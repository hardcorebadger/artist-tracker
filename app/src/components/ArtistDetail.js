import {
  VStack,
  Button,
  Heading,
  Card,
  HStack,
  IconButton,
  Grid,
  GridItem,
  Tabs,
  Badge,
  Stack,
  Text, TabList, Tab,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../routing/AuthGuard';
import { useCollection, useDocument } from 'react-firebase-hooks/firestore';
import { db } from '../firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { Link as ReactRouterLink } from 'react-router-dom'
import { PageLayoutContained } from '../layouts/DashboardLayout';
import Iconify from './Iconify';
import Chart from "react-apexcharts";
import { columnOptions } from './DataGridConfig'
import { useState } from 'react';

const chartOptions = {
  chart: {
    height: 300,
    type: 'area'
  },
  colors:['#329795'],
  dataLabels: {
    enabled: false
  },
  markers: {
    size: 5
  },
  stroke: {
    curve: 'straight'
  },
  tooltip: {
    x: {
      format: 'dd/MM/yy HH:mm'
    },
  },
  yaxis: {
    min: 0
  }
}

const bakeStats = () => {
  const stats = []
  Object.keys(columnOptions).forEach(key => {
    const col = columnOptions[key]
    if (!col.isMetric) {return}
    stats.push(col)
  })
  return stats
}

function CopyrightCard({artist}) {
  const statusColor = artist.eval_status == 'signed' ? 'red' : 'green'
  const typeColor = artist.eval_distro_type == 'major' ? 'red' : artist.eval_distro_type == 'indie' ? 'yellow' : 'green'
  const priorsColor = artist.eval_prios == 'dirty' ? 'yellow' : 'green'
  return (
    <Card p={25} variant="outline" mt={10}>
      <Stack w="100%" spacing={3}>
        <Heading size="xs">Copyright Evaluation</Heading>
        <HStack wrap={'wrap'}><Badge colorScheme={statusColor}>{artist.eval_status}</Badge><Badge colorScheme={typeColor}>{artist.eval_distro_type}</Badge><Badge colorScheme={priorsColor}>{artist.eval_prios}</Badge></HStack>
        <Text fontSize="xs" fontWeight="bold">Distributor</Text>
        <Text >{artist.eval_distro}</Text>
        <Text fontSize="xs" fontWeight="bold" textDecor="uppercase">Label</Text>
        <Text >{artist.eval_label}</Text>
        <Button isDisabled={true}>See Details</Button>
      </Stack>
    </Card>
  )
}

export default function ArtistDetail({artistId, onNavigateBack}) {

  const [artistDoc, artistLoading, artistError] = useDocument(
    doc(db, 'artists_v2', artistId),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )

  const [tabIndex, setTabIndex] = useState(0)

  const artist = artistDoc ? artistDoc.data() : null
  const stats = bakeStats()

  return (
    <VStack spacing={10} align="left">
      <HStack justifyContent='space-between'>
        <HStack spacing={5}>
          {onNavigateBack && <IconButton size="sm" variant="outline" onClick={onNavigateBack} icon={<Iconify icon="mdi:arrow-left"/>}/>}
          <Heading size="lg">{artist?.name}</Heading>
        </HStack>
      <Button colorScheme='primary' as={ReactRouterLink} to='/app/reports/new'>Open in Spotify</Button>
      </HStack>
      <Grid templateColumns='repeat(4, 1fr)' gap={5}>
        <GridItem colSpan={3}>
          <Tabs onChange={(index) => setTabIndex(index)}>
            <TabList>
              {stats.map((s, i) => <Tab key={i}>{s.header}</Tab>)}
              {/* <Tab>Global Streams</Tab>
              <Tab>Spotify Streams</Tab>
              <Tab>Tiktok Views</Tab>
              <Tab>Youtube Views</Tab> */}
            </TabList>
            <Card variant="outline" p={2} mt={5}>
            <Chart
              options={chartOptions}
              series={[{
                name: stats[tabIndex].header,
                data: artist ? artist[stats[tabIndex].name] : []
              }]}
              type="area"
            />
            </Card>
          </Tabs>
        </GridItem>
        <GridItem colSpan={1}>
          {artist && <CopyrightCard artist={artist}/> }
        </GridItem>
        </Grid>
    </VStack>
  );
}
