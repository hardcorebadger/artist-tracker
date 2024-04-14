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
  Text,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../routing/AuthGuard';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../firebase';
import { collection, query, where } from 'firebase/firestore';
import { Link as ReactRouterLink } from 'react-router-dom'
import { PageLayoutContained } from '../layouts/DashboardLayout';
import Iconify from './Iconify';
import Chart from "react-apexcharts";

const chartOptions = {
  chart: {
    height: 300,
    type: 'area'
  },
  colors:['#329795'],
  dataLabels: {
    enabled: false
  },
  stroke: {
    curve: 'smooth'
  },
  xaxis: {
    type: 'datetime',
    categories: ["2018-09-19T00:00:00.000Z", "2018-09-19T01:30:00.000Z", "2018-09-19T02:30:00.000Z", "2018-09-19T03:30:00.000Z", "2018-09-19T04:30:00.000Z", "2018-09-19T05:30:00.000Z", "2018-09-19T06:30:00.000Z"]
  },
  tooltip: {
    x: {
      format: 'dd/MM/yy HH:mm'
    },
  },
}

function CopyrightCard() {
  return (
    <Card p={25} variant="outline" mt={10}>
      <Stack w="100%" spacing={3}>
        <Heading size="xs">Copyright Evaluation</Heading>
        <Wrap><Badge colorScheme='green'>Unsigned</Badge><Badge colorScheme='green'>DIY</Badge><Badge colorScheme='yellow'>Prior Affiliations</Badge></Wrap>
        <Text fontSize="xs" fontWeight="bold">Distributor</Text>
        <Text >Distrokid</Text>
        <Text fontSize="xs" fontWeight="bold" textDecor="uppercase">Label</Text>
        <Text >Distrokid</Text>
        <Button>See Details</Button>
      </Stack>
    </Card>
  )
}

export default function ArtistDetail({artist, onNavigateBack}) {

  return (
    <VStack spacing={10} align="left">
      <HStack justifyContent='space-between'>
        <HStack spacing={5}>
          {onNavigateBack && <IconButton size="sm" variant="outline" onClick={onNavigateBack} icon={<Iconify icon="mdi:arrow-left"/>}/>}
          <Heading size="lg">Kenny Chesney</Heading>
        </HStack>
      <Button colorScheme='primary' as={ReactRouterLink} to='/app/reports/new'>Open in Spotify</Button>
      </HStack>
      <Grid templateColumns='repeat(4, 1fr)' gap={5}>
        <GridItem colSpan={3}>
          <Tabs>
            <TabList>
              <Tab>Global Streams</Tab>
              <Tab>Spotify Streams</Tab>
              <Tab>Tiktok Views</Tab>
              <Tab>Youtube Views</Tab>
            </TabList>
            <Card variant="outline" p={2} mt={5}>
            <Chart
              options={chartOptions}
              series={[{
                name: 'series1',
                data: [31, 40, 28, 51, 42, 109, 100]
              }]}
              type="area"
            />
            </Card>
          </Tabs>
        </GridItem>
        <GridItem colSpan={1}>
          <CopyrightCard/>
        </GridItem>
        </Grid>
    </VStack>
  );
}
