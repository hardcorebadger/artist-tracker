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
import {useOutletContext} from "react-router-dom";
import {LoadingWidget} from "../routing/LoadingScreen";
import moment from "moment";
import UserAvatar from "../components/UserAvatar";

export default function PagePlaylists({}) {
    const user = useUser()
    const [loading, setLoading] = useState(true)
    const colorMode = useColorMode()
    const [playlists, setPlaylists] = useState(null)

    const [queryModel, setQueryModel] = useState({
        pagination: {
            page: 0,
            pageSize: 15,
        }
    })

    useEffect(() => {
        if (queryModel.pagination.page !== playlists?.page || queryModel?.pagination?.pageSize !== playlists?.pageSize) {
            setLoading(true)
            goFetch(user, 'GET', 'playlists', {
                page: queryModel.pagination.page,
                pageSize: queryModel.pagination.pageSize,
            }).then((resp) => {
                setLoading(false)
                if ('playlists' in resp) {
                    setPlaylists(resp)
                }
            })
        }

    }, [queryModel])

    useEffect(() => {

    }, [playlists]);


    const columns = [
        {
            'field': 'name',
            'headerName': 'Name',
            width: 250,
            renderCell: (params) =>
                <HStack align={'center'}>
                    <Text>{params.row.name}</Text>
                    {(params.row.spotify_id ? (<MUILink color='primary' href={'https://open.spotify.com/playlist/' + params.row.spotify_id} target={'_blank'}><Iconify icon="mdi:external-link" /></MUILink>) : null)}
                </HStack>

        },
        {
            field: 'type',
            'headerName': 'Type',
            width: 150,
            valueGetter: (data) => 'Playlist',
            renderCell: (params) => {
                return (
                    <Chip
                        label="Playlist"
                        color="primary"
                        variant={'outlined'}
                        size="small"
                    />
                )
            }
        },
        {
            'field': 'artists',
            'headerName': 'Attributed Artists',
            width: 200
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
            'headerName': 'Last Imported',
            width: 200,
            valueFormatter: params =>
                moment(params?.value).format("YYYY-MM-DD hh:mm A"),
        },
        {
            field: 'first_user',
            headerName: "Added By",
            width: 200,
            renderCell: (params) =>
                <ChakraProvider theme={chakraTheme}>
                <UserAvatar userId={params.row.first_user} />
                </ChakraProvider>
        },
        {
            field: 'last_user',
            headerName: "Last Imported By",
            width: 200,
            renderCell: (params) =>
                <ChakraProvider theme={chakraTheme}>
                    <UserAvatar userId={params.row.last_user} />
                </ChakraProvider>
        }
    ]

    const rows = playlists?.playlists?.map((playlist) => {
        return playlist
    }) ?? []

    return (
        <Box sx={{ height: '80vh', width: "100%" }} p={5}>

            <HStack align={'center'} justifyContent={'space-between'} mb={1}>
                <Heading >
                    Playlists
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
                    rowCount={playlists?.total}
                    paginationMode="server"
                    pagination
                    getRowClassName={(params) => {
                        if (params.row.type === "user") {
                            return "user-row " + colorMode.colorMode; // Add a specific class for user rows
                        } else if (params.row.type === "header") {
                            return "header-row " + colorMode.colorMode; // Optionally, a class for header rows
                        }
                        return "org-row " + colorMode.colorMode; // Default (no additional class)
                    }}
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
                        page: playlists?.page ?? queryModel?.pagination?.page,
                        pageSize: playlists?.pageSize ?? queryModel?.pagination?.pageSize,
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