import {
  Badge,
  Button,
  Card,
  Grid,
  GridItem,
  Heading,
  HStack,
  IconButton,
  Image,
  Link, List, ListItem,
  Stack,
  Tab,
  TabList,
  Tabs,
  Tag,
  Text, UnorderedList, useColorMode,
  useDisclosure,
  VStack,
  Wrap,
} from '@chakra-ui/react';
import Iconify from './Iconify';
import Chart from "react-apexcharts";
import {useContext, useEffect, useState} from 'react';
import {Box, Link as MUILink} from "@mui/material";
import {darkTheme, theme} from "./MuiDataGridServer";
import {ThemeProvider} from "@mui/material/styles";
import {LoadingWidget} from "../routing/LoadingScreen";
import Moment from "react-moment";
import {ColumnDataContext} from "../App";
import UserAvatar from "./UserAvatar";
import ArtistTagsModal from "./EditArtistTags";
import moment from "moment";
import {InlineIcon} from "@iconify/react";

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

const bakeStats = (statisticTypes, linkSources) => {
    const stats = []
    statisticTypes.forEach(stat => {
      // console.log(stat)
      // console.log(linkSources.filter((s) => s.key === stat['source']).pop())
      stats.push({
        'statTypeId' : stat['id'],
        'headerName': linkSources.filter((s) => s.key === stat['source']).pop()?.display_name + " " + stat['name'],
        'statName': stat['name'],
        'sourceLogo': linkSources.filter((s) => s.key === stat['source']).pop()?.logo
      })
    })
    return stats
}

function CopyrightCard({artist, linkSources}) {
  const status =  artist.evaluation?.status === 0 ? 'Unsigned' :  artist.evaluation?.status === 1 ? 'Signed' : 'Unknown';
  const type = artist.evaluation?.distributor_type === 0 ? "DIY" : artist.evaluation?.distributor_type === 1 ? "Indie" : "Major";
  const prios = (artist.evaluation?.back_catalog === 1 ? 'Dirty' : 'Clean')
  const statusColor = artist.evaluation?.status == 1 ? 'red' :  (artist.evaluation?.status == 0 ? 'green' : 'yellow')
  const typeColor = artist.evaluation?.distributor_type == 2 ? 'red' : (artist.evaluation?.distributor_type == 1 ? 'yellow' : 'green')
  const priorsColor = artist.evaluation?.back_catalog == 1 ? 'yellow' : 'green'
  const {colorMode} = useColorMode();
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
                <ThemeProvider theme={colorMode === 'dark' ? darkTheme : theme} key={"detail_" + key}>
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

export default function ArtistDetailNew({artist, onNavigateBack, statisticTypes, linkSources, onTagSave}) {
  const [tabIndex, setTabIndex] = useState(0)
const { isOpen, onOpen, onClose } = useDisclosure()
    const stats = bakeStats(statisticTypes, linkSources)
  const {users} = useContext(ColumnDataContext)
  const [expandedAttributionGroup, setExpandedAttributionGroup] = useState(null)
  const {colorMode} = useColorMode()
  useEffect(() => {
    setExpandedAttributionGroup(null)
  }, [artist]);

  // console.log(artist['statistics'])
  // console.log(stats[tabIndex])
  // console.log(stats[tabIndex]?.statTypeId)
  const filteredStat = artist['statistics'].filter((stat) => stat['statistic_type_id'] === stats[tabIndex]?.statTypeId).pop() ?? null
  const filteredData = (filteredStat && 'data' in filteredStat) ? filteredStat['data'] : []
  // console.log(filteredStat)
  // console.log(filteredData)


  if (stats?.length === null || stats.length === 0) {
    return (
        <LoadingWidget/>
    )
  }

  const attributionGroups = []

  artist?.attributions?.forEach((attribution) => {
    if (attributionGroups.length === 0) {
      attributionGroups.push([])
    }
    const currentGroup = attributionGroups.length - 1
    if (attributionGroups[currentGroup].length === 0) {
      attributionGroups[currentGroup].push(attribution)
    } else {
      const last = attributionGroups[currentGroup][0]
      if (last.user_id === attribution.user_id && moment( last.created_at).format('YYYY-MM-DD') === moment(attribution.created_at).format('YYYY-MM-DD')) {
        attributionGroups[currentGroup].push(attribution)
      } else {
        attributionGroups.push([attribution])

      }
    }
  })
  return (


      <VStack spacing={10} align="left">
      <HStack justifyContent='space-between'>
        <Stack spacing={5} direction={{base: 'column', md: 'row'}} >
          {onNavigateBack && <IconButton size="sm" variant="outline" onClick={onNavigateBack} icon={<Iconify icon="mdi:arrow-left"/>} aria-label={"Back"}/>}
          <Heading size="lg"><Box sx={{'display': 'flex', 'alignItems': 'center'}}><Image mr={2} height={'50px'} src={artist.avatar}/> <Text >{artist?.name}</Text></Box></Heading>
          <HStack spacing={3} ms={1} pt={'3px'}>
            {artist?.tags.map((item) => {
              return <Tag p={1} px={2} key={"tag-"+item.id} variant="outline" size='small'>{item.tag}</Tag>
            })}
            <Button variant={'unstyled'} onClick={() => {
              onOpen()
            }}><Iconify icon={'material-symbols:edit-outline'}/></Button>
          </HStack>
        </Stack>


        <Button colorScheme='primary'><Link href={ artist.link_spotify } target="_blank">
        Open in Spotify</Link></Button>
      </HStack>
      <Grid templateColumns={{base: '1fr', md: 'repeat(4, 1fr)'}} gap={5}>
        <GridItem colSpan={{base: 1, md: 3}}>
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
              {filteredData && filteredData.length > 0 ? (
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
                        theme: {
                          mode: colorMode
                        },
                        chart: {
                          background: 'transparent',
                        },
                        ...chartOptions
                      }}
                      series={[{
                        name: stats[tabIndex].headerName,
                        data: filteredData
                      }]}

                      type="area"
                  />
              ) : null}

            </Card>
            <Card variant={"unstyled"} p={2} mt={5}>
              <Wrap justify={'center'}>
              {
                attributionGroups.map((item, index) => {
                  let selected = false
                  if (index === expandedAttributionGroup) {
                    selected = true
                  }
                  return [
                      (<Wrap onClick={() => {
                        if (expandedAttributionGroup === index) {
                          setExpandedAttributionGroup(null)
                        } else {
                          setExpandedAttributionGroup(index)
                        }
                      }} align={'center'} justify={'center'} key={item[0].id + "-group"} style={{width: '100%', marginBottom: (item.length > 1 ? '-10px' : null), cursor: (item.length > 1 ? 'pointer' : null)}}>

                        <UserAvatar inline={true} userId={item[0].user_id}/>
                        <Text color={"text.subtle"} fontSize={"15px"} ml={"-5px"}>
                          &nbsp;added{item.length > 1 ? ' ' + item.length + ' times ' : ''} on <Moment
                            format={"ll"}>{item[0].created_at}</Moment>{item.length === 1 ? (
                            (<span> at <Moment
                                format={"hh:mm A"}>{item.created_at}</Moment> {item[0].playlist ? 'from' : 'manually'}</span>)
                        ) : null}</Text>
                        {item.length > 1 ? (
                            <IconButton variant={'unstyled'} icon={<InlineIcon icon={'weui:arrow-filled'}  style={{ transform: (selected ? 'rotate(90deg)' : 'rotate(180deg)') }}/>}
                                        aria-label={selected ? 'Collapse' : 'Expand'}/>
                        ) : null}
                        {item[0].playlist && item.length === 1 ?
                            (
                                <ThemeProvider theme={colorMode === 'dark' ? darkTheme : theme}>

                                  <MUILink target="_blank"
                                           href={"https://open.spotify.com/playlist/" + item[0].playlist.spotify_id}>{item[0].playlist.name}
                                    <Iconify sx={{display: 'inline-block', verticalAlign: '-0.145em', marginLeft: '5px'}}
                                             icon="mdi:external-link"/> </MUILink>
                                </ThemeProvider>
                            ) : null
                        }
                      </Wrap>),
                      (selected && item.length > 1 ? (
                        <List>
                        {item.map((item) => {
                          const user = users ? users[item.user_id] : null

                          return (
                              <ListItem><Wrap align={'center'} key={item.id} justify={'center'} style={{width: '100%'}}>

                                {/*<UserAvatar inline={true} userId={item.user_id}/>*/}
                                <Text color={"text.subtle"} fontSize={"14px"} ml={"-5px"}>
                                  <Moment format={"ll"}>{item.created_at}</Moment> at <Moment
                                    format={"hh:mm A"}>{item.created_at}</Moment> {item.playlist ? 'from' : 'manually'}
                                </Text>
                                {item.playlist ?
                                    (
                                        <ThemeProvider theme={colorMode === 'dark' ? darkTheme : theme}>

                                          <MUILink target="_blank"
                                                   href={"https://open.spotify.com/playlist/" + item.playlist.spotify_id}>{item.playlist.name}
                                            <Iconify sx={{display: 'inline-block', verticalAlign: '-0.125em'}}
                                                     icon="mdi:external-link"/> </MUILink>
                                        </ThemeProvider>
                                    ) : null
                                }
                              </Wrap></ListItem>
                          )
                        })}
                      </List>) : null)
                    ]

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
