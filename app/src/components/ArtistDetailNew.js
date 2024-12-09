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
  Text, Link, Image, Tag, useDisclosure,
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
import {useContext, useEffect, useState} from 'react';
import {Box, Chip, Link as MUILink} from "@mui/material";
import {theme} from "./MuiDataGridServer";
import {ThemeProvider} from "@mui/material/styles";
import {LoadingWidget} from "../routing/LoadingScreen";
import Moment from "react-moment";
import {ColumnDataContext} from "../App";
import UserAvatar from "./UserAvatar";
import ArtistTagsModal from "./EditArtistTags";

const chartOptions = {

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

const bakeStats = (linkSources) => {
    const stats = []
    Object.keys(columnOptions).forEach(key => {
      const col = columnOptions[key]
      if (!col.isMetric) {
        return
      }
      col.sourceLogo = linkSources.filter((s) => s.key === col.source).pop()?.logo
      stats.push(col)
    })
    return stats
}

function CopyrightCard({artist, linkSources}) {
  const status =  artist.evaluation?.status === 0 ? 'Unsigned' :  artist.evaluation?.status === 1 ? 'Signed' : 'Unknown';
  const type = artist.evaluation?.distributor_type === 0 ? "DIY" : artist.evaluation?.distributor_type === 1 ? "Indie" : "Major";
  const prios = (artist.evaluation?.status === 2 ? 'Dirty' : 'Clean')
  const statusColor = artist.evaluation?.status == 1 ? 'red' :  (artist.evaluation?.status == 0 ? 'green' : 'yellow')
  const typeColor = artist.evaluation?.distributor_type == 2 ? 'red' : (artist.evaluation?.distributor_type == 1 ? 'yellow' : 'green')
  const priorsColor = artist.evaluation?.status == 2 ? 'yellow' : 'green'

  const links =  Object.keys(artist).filter((key) => {
    if (!key.startsWith('link_')){
      return false;
    }
    const value = artist[key]
    if (value === null) {
      return false
    }
    return true
  })
  return (

      <Box sx={{maxWidth: '100%'}}>
    <Card p={25} variant="outline" mt={0}>
        {artist.evaluation ? (
            <Stack w="100%" spacing={3}>
              <Heading size="xs">Copyright Evaluation</Heading>
              <Wrap><Badge colorScheme={statusColor}>{status}</Badge><Badge colorScheme={typeColor}>{type}</Badge><Badge colorScheme={priorsColor}>{prios}</Badge></Wrap>
              <Text fontSize="xs" fontWeight="bold">Distributor</Text>
              <Text >{artist.evaluation?.distributor}</Text>
              <Text fontSize="xs" fontWeight="bold" textDecor="uppercase">Label</Text>
              <Text >{artist.evaluation?.label }</Text>
            </Stack>

        ) : (
            <Stack w="100%" spacing={3}>
              <Heading size="xs">Copyright Evaluation</Heading>
              <Text color={'text.subtitle'}>Analysis in progress...</Text>
            </Stack>
        )}

        {/*<Button isDisabled={true}>See Details</Button>*/}
    </Card>
    <Card p={25} variant="outline" mt={5}>
        <Stack w="100%" spacing={3}>
          <Heading size="xs">Links</Heading>
          {links.map((key) => {
            const value = artist[key]
            const source = linkSources.filter((s) => s.key === (key.split("link_")[1])).pop()
            return (
                <ThemeProvider theme={theme} key={"detail_" + key}>
                 <MUILink color='primary' href={value}>
                   <Wrap align={'center'}>
                     <Iconify icon={source?.logo}/> {source?.display_name} <Iconify icon="mdi:external-link" />
                   </Wrap>
                 </MUILink>
                </ThemeProvider>
            )
          })}
          {links?.length === 0 ? (
              <Text fontSize={"12px"} color={'text.subtitle'}>Links are being imported now</Text>
          ) : null}
        </Stack>
      </Card>
    </Box>
  )
}

export default function ArtistDetailNew({artist, onNavigateBack, linkSources, onTagSave}) {
  const [tabIndex, setTabIndex] = useState(0)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const stats = bakeStats(linkSources)
  const {users} = useContext(ColumnDataContext)
  const filteredStat = artist['statistics'].filter((stat) => stat['statistic_type_id'] === stats[tabIndex]?.statTypeId).pop() ?? null
  const filteredData = (filteredStat && 'data' in filteredStat) ? filteredStat['data'] : []



  if (stats.length === 0) {
    return (
        <LoadingWidget/>
    )
  }
  return (


      <VStack spacing={10} align="left">
      <HStack justifyContent='space-between'>
        <HStack spacing={5}>
          {onNavigateBack && <IconButton size="sm" variant="outline" onClick={onNavigateBack} icon={<Iconify icon="mdi:arrow-left"/>}/>}
          <Heading size="lg"><Box sx={{'display': 'flex', 'alignItems': 'center'}}><Image mr={2} height={'50px'} src={artist.avatar}/> <Text >{artist?.name}</Text></Box></Heading>
          <HStack spacing={3} ms={1} pt={'3px'}>
            {artist?.tags.map((item) => {
              return <Tag p={1} px={2} key={"tag-"+item.id} variant="outline" size='small'>{item.tag}</Tag>
            })}
            <Button variant={'unstyled'} onClick={() => {
              onOpen()
            }}><Iconify icon={'material-symbols:edit-outline'}/></Button>
          </HStack>
        </HStack>


        <Button colorScheme='primary'><Link href={ artist.link_spotify } target="_blank">
        Open in Spotify</Link></Button>
      </HStack>
      <Grid templateColumns='repeat(4, 1fr)' gap={5}>
        <GridItem colSpan={3}>
          <Tabs onChange={(index) => setTabIndex(index)}>
            <TabList>
              {stats.map((s, i) => (
                  <Tab key={i} sx={{fontSize: '12px'}}>
                    <Iconify icon={s.sourceLogo} size={20}/>
                    &nbsp;{s.statName}
                  </Tab>
              ))}
              {/* <Tab>Global Streams</Tab>
              <Tab>Spotify Streams</Tab>
              <Tab>Tiktok Views</Tab>
              <Tab>Youtube Views</Tab> */}
            </TabList>
            <Card variant="outline" p={2} mt={5}>
              <Heading size={'md'}>{stats[tabIndex].headerName}{(filteredData && filteredData.length > 0 ? '' : ' - (No Data Available)')}</Heading>
              <Chart
                height={'300px'}
                options={{
                  xaxis: (filteredData && filteredData.length > 0) ? {
                    labels: {
                      show: true,
                      formatter: function (val) {
                        if (filteredStat) {
                          return filteredStat['dates'][val]
                        } else {
                          return "N/A"
                        }
                      }
                    }
                  } : {},
                  ...chartOptions
                }}
                series={[{
                  name: stats[tabIndex].headerName,
                  data: filteredData
                }]}

                type="area"
              />
            </Card>
            <Card variant={"unstyled"} p={2} mt={5}>
              <Wrap justify={'center'}>
              {
                artist?.attributions?.map(item => {
                  const user = users ? users[item.user_id] : null
                  return (

                      <Wrap align={'center'} key={item.id}>

                        <UserAvatar inline={true} userId={item.user_id}/>
                      <Text color={"text.subtle"} fontSize={"15px"} ml={"-5px"}>
                        &nbsp;added on <Moment format={"ll"}>{item.created_at}</Moment> at <Moment format={"hh:mm A"}>{item.created_at}</Moment> {item.playlist ? 'from' : 'manually'}
                      </Text>
                        {item.playlist ?
                            (
                                <ThemeProvider theme={theme}  >

                                <MUILink target="_blank" href={"https://open.spotify.com/playlist/" + item.playlist.spotify_id}>{item.playlist.name} <Iconify sx={{display: 'inline-block', verticalAlign: '-0.125em'}} icon="mdi:external-link" /> </MUILink>
                                </ThemeProvider>
                            ) : null
                        }
                      </Wrap>
                  )
                })
              }
              </Wrap>
            </Card>
          </Tabs>

        </GridItem>
        <GridItem colSpan={1}>
          {artist && <CopyrightCard artist={artist} linkSources={linkSources}/> }
        </GridItem>
        </Grid>
        <ArtistTagsModal
          artist={artist}
          onOpen={onOpen}
          onClose={onClose}
          isOpen={isOpen}
          onTagSave={onTagSave}
        />
    </VStack>
  );
}
