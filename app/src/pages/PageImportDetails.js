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
    Portal, Text,
    useColorMode, useDisclosure,
    useToast
} from "@chakra-ui/react";
import Iconify from "../components/Iconify";
import {goFetch} from "../App";
import {useUser} from "../routing/AuthGuard";
import {ChevronDownIcon, ChevronRightIcon} from "@chakra-ui/icons";
import {useOutletContext, useParams} from "react-router-dom";
import {LoadingWidget} from "../routing/LoadingScreen";
import moment from "moment";
import UserAvatar from "../components/UserAvatar";

export default function PageImportDetails({}) {
    const user = useUser()
    const [loading, setLoading] = useState(true)
    const colorMode = useColorMode()
    const [importObj, setImportObj] = useState(null)

    const { importId } = useParams()


    const [queryModel, setQueryModel] = useState({
        pagination: {
            page: 0,
            pageSize: 15,
        }
    })

    useEffect(() => {
        console.log(queryModel)
        if (queryModel.pagination.page !== importObj?.page || queryModel?.pagination?.pageSize !== importObj?.pageSize) {
            setLoading(true)
            goFetch(user, 'GET', 'imports', {
                id: importId,
                page: queryModel.pagination.page,
                pageSize: queryModel.pagination.pageSize,
            }).then((resp) => {
                setLoading(false)
                if ('import' in resp) {
                    setImportObj(resp)
                }
            })
        }

    }, [queryModel])

    useEffect(() => {

    }, [importObj]);


    const columns = [
        {
            field: 'index',
            headerName: '#',
            width: 50,
        },
        {
            field: 'artist.name',
            headerName: 'Artist',
            width: 250,
            valueGetter: (data) => data.row.artist?.name ?? data.row.name ?? "Unknown",
            renderCell: (params) => {
                const link = 'https://open.spotify.com/artist/' + params.row['spotify_id']
                return (
                    <ChakraProvider theme={chakraTheme}>
                    <HStack align={'center'}>
                        <Avatar size={'xs'} borderRadius={2} name={params.value}  src={params.row.artist?.avatar}/>

                        <Typography fontSize={'medium'}>{params.value}</Typography>
                        <MUILink href={link} target={'_blank'}><Iconify icon="mdi:external-link" /></MUILink>

                    </HStack>
                    </ChakraProvider>
                )
            }
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 150,
            renderCell: (params) => {

                return (
                    <Chip
                        variant={'outlined'}
                        size={'small'}
                        label={params.value === 0 ? 'Pending' : (params.value === 1 ? 'Failed' : 'Imported')}
                        color={params.value === 0 ? 'warning' : (params.value === 1 ? 'error' : 'primary')}
                    />

                )
            }
        },
        {
            'field': 'created_at',
            'headerName': 'Created At',
            width: 200,
            valueFormatter: params =>
                moment(params?.value).format("YYYY-MM-DD hh:mm A"),
        },
        {
            'field': 'updated_at',
            'headerName': 'Completed At',
            width: 200,
            valueGetter: (data) => {
                return data.row.status == 0 ? "N/A" : moment(data?.row['updated_at']).format("YYYY-MM-DD hh:mm A")

            }
        },
    ]

    const rows = importObj?.import?.artists.map((playlist, index) => {
        playlist['index'] = (index + 1) + (importObj?.page * importObj?.pageSize)
        return playlist
    }) ?? []

    return (
        <Box sx={{ height: '80vh', width: "100%" }} p={5}>

            <HStack align={'center'} justifyContent={'space-between'} mb={1}>
                <Heading >
                    {importObj?.import?.playlist_id === null ? 'Lookalike' : 'Playlist'} Import
                </Heading>
                {/*/!* Add Organization Button *!/*/}
                {/*<Button colorScheme="blue" onClick={onOpen} mb={4}>*/}
                {/*    Import Playlist*/}
                {/*</Button>*/}
            </HStack>
            <ThemeProvider theme={colorMode.colorMode === "dark" ? darkTheme : theme}>


                {/* Chakra Modal */}

                <DataGridPro
                    rows={rows}
                    columns={columns}
                    rowCount={importObj?.total}
                    paginationMode="server"
                    pagination
                    sx={{'& .MuiDataGrid-columnHeaderTitle': {
                            fontWeight: '900',
                        }}}
                    onPaginationModelChange={(newModel) => {
                        setQueryModel({
                            pagination: {
                                page: newModel.page,
                                pageSize: newModel.pageSize,
                            }
                        })
                    }}
                    initialState={{
                        pagination: queryModel?.pagination
                    }}
                    paginationModel={{
                        page: importObj?.page ?? queryModel?.pagination?.page,
                        pageSize: importObj?.pageSize ?? queryModel?.pagination?.pageSize,
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