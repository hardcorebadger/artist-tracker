import {
  VStack,
  Button,
  Heading,
  Card,
  TableContainer,
  Table,
  TableCaption,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  HStack,
  IconButton,
  Grid,
  GridItem,
  Tabs,
  TabList,
  Tab,
  Wrap,
  Badge,
  Stack,
  Text, Link,
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
  const status =  artist.evaluation?.status === 0 ? 'Unsigned' :  artist.evaluation?.status === 1 ? 'Signed' : 'Unknown';
  const type = artist.evaluation?.distributor_type === 0 ? "DIY" : artist.evaluation?.distributor_type === 1 ? "Indie" : "Major";
  const prios = (artist.evaluation?.status === 2 ? 'Dirty' : 'Clean')
  const statusColor = artist.evaluation?.status == 1 ? 'red' :  (artist.evaluation.status == 0 ? 'green' : 'yellow')
  const typeColor = artist.evaluation?.distributor_type == 2 ? 'red' : (artist.evaluation?.distributor_type == 1 ? 'yellow' : 'green')
  const priorsColor = artist.evaluation?.status == 2 ? 'yellow' : 'green'
  return (
    <Card p={25} variant="outline" mt={10}>
      <Stack w="100%" spacing={3}>
        <Heading size="xs">Copyright Evaluation</Heading>
        <Wrap><Badge colorScheme={statusColor}>{status}</Badge><Badge colorScheme={typeColor}>{type}</Badge><Badge colorScheme={priorsColor}>{prios}</Badge></Wrap>
        <Text fontSize="xs" fontWeight="bold">Distributor</Text>
        <Text >{artist.evaluation?.distributor}</Text>
        <Text fontSize="xs" fontWeight="bold" textDecor="uppercase">Label</Text>
        <Text >{artist.evaluation?.label}</Text>
        <Button isDisabled={true}>See Details</Button>
      </Stack>
    </Card>
  )
}

export default function ArtistDetailNew({artist, onNavigateBack}) {

  const [tabIndex, setTabIndex] = useState(0)
  const stats = bakeStats()
  const filteredStat = artist['statistics'].filter((stat) => stat['statistic_type_id'] === stats[tabIndex]?.statTypeId).pop()
  const filteredData = (filteredStat && 'data' in filteredStat) ? filteredStat['data'] : []
  return (
    <VStack spacing={10} align="left">
      <HStack justifyContent='space-between'>
        <HStack spacing={5}>
          {onNavigateBack && <IconButton size="sm" variant="outline" onClick={onNavigateBack} icon={<Iconify icon="mdi:arrow-left"/>}/>}
          <Heading size="lg">{artist?.name}</Heading>
        </HStack>
      <Button colorScheme='primary'><Link href={ artist.link_spotify } target="_blank">
        Open in Spotify</Link></Button>
      </HStack>
      <Grid templateColumns='repeat(4, 1fr)' gap={5}>
        <GridItem colSpan={3}>
          <Tabs onChange={(index) => setTabIndex(index)}>
            <TabList>
              {stats.map((s, i) => <Tab key={i}>{s.headerName}</Tab>)}
              {/* <Tab>Global Streams</Tab>
              <Tab>Spotify Streams</Tab>
              <Tab>Tiktok Views</Tab>
              <Tab>Youtube Views</Tab> */}
            </TabList>
            <Card variant="outline" p={2} mt={5}>
            <Chart
              options={chartOptions}
              series={[{
                name: stats[tabIndex].headerName,
                data: filteredData
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
