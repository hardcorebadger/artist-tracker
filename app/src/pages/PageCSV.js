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
import Chart from "react-apexcharts";
import { db } from '../firebase';
import { setDoc, doc, getDoc, addDoc, collection, deleteDoc } from 'firebase/firestore';
import { useDocument } from 'react-firebase-hooks/firestore';
const chartOptions = {
  chart: {
    animations: {
      enabled: false
    },
    height: 300,
    type: 'area'
  },
  dataLabels: {
    enabled: false
  },
  stroke: {
    curve: 'smooth'
  },
  // xaxis: {
  //   type: 'datetime',
  //   categories: ["2018-09-19T00:00:00.000Z", "2018-09-19T01:30:00.000Z", "2018-09-19T02:30:00.000Z", "2018-09-19T03:30:00.000Z", "2018-09-19T04:30:00.000Z", "2018-09-19T05:30:00.000Z", "2018-09-19T06:30:00.000Z"]
  // },
  tooltip: {
    x: {
      format: 'dd/MM/yy HH:mm'
    },
  },
}

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

function parse_csv_dates(csv_string) {
  const rough_split = csv_string.split('[')
  const dates_row = rough_split[0].substring(1, rough_split[0].length - 1)
  const dates = dates_row.split(',')
  return dates
}

function parse_csv_series(csv_string) {
  const series = []
  const rough_split = csv_string.split('[')
  rough_split.forEach((row_text, index) => {
    if (index == 0)
      return
    const is_last = (index < rough_split.length-1)
    const repaired = is_last ? "[" + row_text : "[" + row_text.substring(0, row_text.length - 1)
    const split_array = repaired.split(',')
    const series_title = split_array.shift()
    const floatArray = split_array.map(element => parseFloat(element));
    const filteredArray = floatArray.filter((element, index) => {
      // Keep every fourth element
      // Since indexing is zero-based, we add 1 to make it calculate correctly
      return index % 8 === 0;
    });
    series.push({
      name: series_title,
      data: filteredArray
    })
  })
  return series
}

function PageArtist() {

  const [csv, csvLoading, csvError] = useDocument(
    doc(db, 'csv', 'fleet-foxes'),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )

  if (csvLoading || csvError) {
    return <PageLayoutContained>Loading...</PageLayoutContained>
  }
  
  const string_csv = csv.data()['data']
  const dates = parse_csv_dates(string_csv)
  const series = parse_csv_series(string_csv)

  return (
      <PageLayoutContained size="lg">
        <VStack spacing={10} align="left">
          <Chart
              options={chartOptions}
              series={series}
              type="line"
            />
        </VStack>
      </PageLayoutContained>
  );
}

export default PageArtist;
