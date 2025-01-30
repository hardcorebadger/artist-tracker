import React, { useEffect, useState } from "react";
import {Box, Typography, CircularProgress, IconButton, Chip, Link as MUILink} from "@mui/material";
import { DataGridPro } from "@mui/x-data-grid-pro";
import {
    collection,
    query,
    limit,
    getDocs,
    startAfter,
    orderBy,
    where,
    getCountFromServer,
    addDoc, deleteDoc, doc
} from "firebase/firestore";
import { db } from "../firebase";
import { ThemeProvider } from "@mui/material/styles";
import { darkTheme, theme } from "../components/MuiDataGridServer";
import {theme as chakraTheme} from '../theme'
import {
    Avatar,
    Button, ChakraProvider, Checkbox, FormControl, FormLabel, Heading, HStack, Input,
    Menu,
    MenuButton,
    MenuItem,
    MenuList, Modal, ModalBody, ModalCloseButton,
    ModalContent, ModalFooter, ModalHeader, ModalOverlay,
    Portal, Progress, ProgressLabel, Stack, Text,
    useColorMode, useDisclosure,
    useToast
} from "@chakra-ui/react";
import Iconify from "../components/Iconify";
import {goFetch} from "../App";
import {useUser} from "../routing/AuthGuard";
import {ChevronDownIcon, ChevronRightIcon} from "@chakra-ui/icons";
import {useNavigate, useOutletContext} from "react-router-dom";
import {LoadingWidget} from "../routing/LoadingScreen";
import moment from "moment";
import UserAvatar from "../components/UserAvatar";

export default function PageImports({}) {
    const user = useUser()
    const [loading, setLoading] = useState(true)
    const colorMode = useColorMode()
    const [imports, setImports] = useState(null)

    const navigate = useNavigate()
    const [queryModel, setQueryModel] = useState({
        pagination: {
            page: 0,
            pageSize: 15,
        }
    })

    const loadImports = async () => {
        setLoading(true)
        goFetch(user, 'GET', 'imports', {
            page: queryModel.pagination.page,
            pageSize: queryModel.pagination.pageSize,
        }).then((resp) => {
            setLoading(false)
            if ('imports' in resp) {
                setImports(resp)
            }
        })
    }

    useEffect(() => {
        if (queryModel.pagination.page !== imports?.page || queryModel?.pagination?.pageSize !== imports?.pageSize) {
            loadImports()
        }

    }, [queryModel])

    useEffect(() => {

    }, [imports]);


    const columns = [
        {
            field: 'type',
            headerName: 'Type',
            width: 100,
            valueGetter: (data) => data.row['playlist_id'] === null ? 'Lookalike' : 'Playlist',
            renderCell: (params) => {
                return (
                    <Chip
                        label={params.value}
                        color="primary"
                        variant={'outlined'}
                        size="small"
                    />
                )
            }
        },
        {
            field: 'name',
            headerName: 'Name',
            width: 250,
            valueGetter: (data) => {
                if (data.row['playlist_id'] === null) {
                    return data.row['lookalike']['target_artist']['name'] + " Lookalike"
                } else {
                    return data.row['playlist']['name']
                }
            },
            renderCell: (params) => {
                const link = params.row['playlist_id'] === null ? 'https://open.spotify.com/artist/' + params.row['lookalike']['target_artist']['spotify_id'] : 'https://open.spotify.com/playlist/' + params.row['playlist']['spotify_id']
                return (
                    <ChakraProvider theme={chakraTheme}>
                    <HStack align={'center'}>
                        <Avatar size={'xs'} borderRadius={2} name={params.value}  src={params.row.playlist?.image ?? params.row.lookalike?.artist?.avatar ?? null}/>
                        <Typography fontSize={'medium'}>{params.value}</Typography>
                        <MUILink href={link} target={'_blank'}><Iconify icon="mdi:external-link" /></MUILink>

                    </HStack>
                    </ChakraProvider>
                )
            }
        },
        {
            field: 'artists.total',
            headerName: '# Artists',
            width: 75,
            valueGetter: (data) => {
                return data.row.artists.total
            },
            renderCell: (params) => {
                return (
                    <Box sx={{width: "100%", textAlign: "center"}}>

                        <Typography>{params.value}</Typography>
                    </Box>
                )
            }

        },
        {
            field: 'status',
            headerName: 'Status',
            width: 240,
            valueGetter: (data) => {
                return Math.round(((data.row.artists.complete + data.row.artists.failed) / data.row.artists.total) * 10000) / 100
            },
            renderCell: (params) => {
                return (
                    <ChakraProvider theme={chakraTheme}>
                        <Stack w={'100%'}>
                            <Text>{params.row.status.ucwords()} - {params.value}%</Text>
                            <Progress size="sm" colorScheme={params.row.status == 'complete' ? 'primary' : (params.row.status === 'failed' ? 'red' : 'yellow')} value={params.value}/>

                        </Stack>
                    </ChakraProvider>

                )
            }

        },
        {
            'field': 'created_at',
            'headerName': 'Started',
            width: 200,
            valueFormatter: params =>
                moment(params?.value).format("YYYY-MM-DD hh:mm A"),
        },
        {
            'field': 'completed_at',
            'headerName': 'Completed',
            width: 200,
            valueFormatter: params =>
                params.value ? (moment(params?.value).format("YYYY-MM-DD hh:mm A")) : "N/A",
        },
    ]

    const rows = imports?.imports?.map((playlist) => {
        return playlist
    }) ?? []

    return (
        <Box sx={{ height: '80vh', width: "100%" }} p={5}>

            <HStack align={'center'} justifyContent={'space-between'} mb={5}>
                <Heading >
                    Imports
                </Heading>
                {/*/!* Add Organization Button *!/*/}
                <Button colorScheme="primary" onClick={loadImports} >
                    <Iconify icon="mdi:refresh" size={'18px'} />
                </Button>
            </HStack>
            <ThemeProvider theme={colorMode.colorMode === "dark" ? darkTheme : theme}>


                {/* Chakra Modal */}

                <DataGridPro
                    rows={rows}
                    columns={columns}
                    rowCount={imports?.total}
                    paginationMode="server"
                    pagination
                    sx={{'& .MuiDataGrid-columnHeaderTitle': {
                            fontWeight: '900',
                        }}}
                    onPaginationModelChange={(newModel) => {
                        if (queryModel.pagination.page !== newModel.page || queryModel.pagination.pageSize !== newModel.pageSize) {
                            setQueryModel({
                                pagination: {
                                    page: newModel.page,
                                    pageSize: newModel.pageSize,
                                }
                            })
                        }
                    }}
                    onRowClick={(params) => {
                        navigate(`/app/imports/${params.row.id}`);
                    }}
                    initialState={{
                        pagination: queryModel?.pagination
                    }}
                    paginationModel={{
                        page: imports?.page ?? queryModel?.pagination?.page,
                        pageSize: imports?.pageSize ?? queryModel?.pagination?.pageSize,
                    }}
                    pageSizeOptions={[5, 10, 15, 20]}
                    onPageSizeChange={(newPageSize) => setQueryModel({
                        pagination: {
                            ...queryModel.pagination,
                            pageSize: newPageSize
                        }
                    })}
                    loading={loading}
                    getRowId={(row) => row.id}
                />
            </ThemeProvider>
        </Box>
    );
}