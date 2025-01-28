import React, { useEffect, useState } from "react";
import { Box, Typography, CircularProgress, IconButton } from "@mui/material";
import { DataGridPro } from "@mui/x-data-grid-pro";
import {collection, query, limit, getDocs, startAfter, orderBy, where, getCountFromServer} from "firebase/firestore";
import { db } from "../firebase";
import { ThemeProvider } from "@mui/material/styles";
import { darkTheme, theme } from "../components/MuiDataGridServer";
import {Button, Menu, MenuButton, MenuItem, MenuList, Portal, useColorMode, useToast} from "@chakra-ui/react";
import Iconify from "../components/Iconify";
import {goFetch} from "../App";
import {useUser} from "../routing/AuthGuard";
import {ChevronDownIcon, ChevronRightIcon} from "@chakra-ui/icons";

export default function PageAdmin() {
    const [rows, setRows] = useState([]); // Holds all rows (organizations and users)
    const [expandedOrgIds, setExpandedOrgIds] = useState({}); // Tracks expanded/collapsed state per organization
    const [loading, setLoading] = useState(true); // Loading state for organizations and users
    const [rowCountState, setRowCountState] = useState(0); // Total rows (Firestore)
    const colorMode = useColorMode(); // Light/Dark theme
    const [pageSize, setPageSize] = useState(15); // Number of visible rows per page
    const [currentPage, setCurrentPage] = useState(0); // Current page
    const [lastVisible, setLastVisible] = useState(null); // Keeps track of the last document (for Firestore pagination)
    const user = useUser();
    const toast = useToast()
    useEffect(() => {
        fetchOrganizations();
    }, [currentPage, pageSize]);

    const fetchSubAPI = async(orgIds, theRows) => {

        console.log("Fetching ", orgIds)

        goFetch(user, 'POST', 'admin-organizations', {ids: orgIds}).then((response) => {
            const newRows = [...theRows];
            for (let org of response) {

                const index = newRows.findIndex(item => (item.organization_id ?? "NA") === org.id && item.type === 'organization');

                // Check if the item exists
                if (index !== -1) {
                    // Update the item with the new values
                    newRows[index] = { ...newRows[index], ...{"subscription": org.subscription, "users": org.users} };
                    setRows(newRows)
                }
            }
        });
    }

    const fetchOrganizations = async () => {
        setLoading(true);
        try {
            let orgQuery;

            if (currentPage > 0 && lastVisible) {
                // Apply pagination using 'startAfter'
                orgQuery = query(
                    collection(db, "organizations"),
                    orderBy("name"),
                    startAfter(lastVisible),
                    limit(pageSize)
                );
            } else {
                // First page query without 'startAfter'
                orgQuery = query(
                    collection(db, "organizations"),
                    orderBy("name"),
                    limit(pageSize)
                );
            }

            const orgSnapshot = await getDocs(orgQuery);
            const fetchCount = async () => {
                try {
                    const collectionRef = collection(db, 'organizations');
                    const snapshot = await getCountFromServer(collectionRef);
                    setRowCountState(snapshot.data().count);
                } catch (e) {
                } finally {
                }
            };
            fetchCount()
            const fetchedRows = [];
            const ids = []
            for (let orgDoc of orgSnapshot.docs) {
                const org = { id: orgDoc.id, ...orgDoc.data() };

                // Add organization row
                fetchedRows.push({
                    id: `org-${org.id}`, // Unique ID for organization
                    type: "organization",
                    name: org.name,
                    organization_id: org.id,
                    free_mode: org.free_mode ?? false,
                    email: null,
                    first_name: null,
                    last_name: null,
                });
                ids.push(org.id)
            }

            setRows(fetchedRows);

            setLastVisible(orgSnapshot.docs[orgSnapshot.docs.length - 1] || null); // Update last visible document
            fetchSubAPI(ids, fetchedRows)
        } catch (error) {
            console.error("Error fetching organizations:", error);
        } finally {
            setLoading(false);

        }
    };
    const toggleExpandCollapse = async (orgId) => {
        const isExpanded = expandedOrgIds[orgId];

        if (isExpanded) {
            // Collapse logic: Filter out the header and user rows
            setRows((prevRows) =>
                prevRows.filter(
                    (row) => row.orgId !== `org-${orgId}` && row.id !== `${orgId}-header`
                )
            );
        } else {
            // Expand logic: Fetch users and add them under the organization
            const users = await fetchUsersForOrg(orgId);

            setRows((prevRows) => {
                const orgIndex = prevRows.findIndex((row) => row.id === `org-${orgId}`);
                const newRows = [...prevRows];
                newRows.splice(orgIndex + 1, 0, ...users); // Insert users below the organization row
                return newRows;
            });
        }

        // Update expanded/collapsed state
        setExpandedOrgIds((prevState) => ({
            ...prevState,
            [orgId]: !isExpanded,
        }));
    };

    const toggleFreeMode = async (orgId, free_mode) => {
        goFetch(user, 'POST', 'edit-organization', {
            "id": orgId,
            "free_mode": free_mode
        }).then((response) => {
            console.log(response)
            fetchOrganizations()
        })
    }

    const fetchUsersForOrg = async (orgId) => {
        try {
            const usersQuery = query(
                collection(db, "users"),
                where("organization", "==", orgId)
            );
            const usersSnapshot = await getDocs(usersQuery);

            const users = [
                {
                    id: `${orgId}-header`, // Header row ID
                    type: "header",
                    orgId: orgId,
                },
            ];

            usersSnapshot.forEach((userDoc) => {
                const user = { id: userDoc.id, ...userDoc.data() };

                users.push({
                    id: `user-${user.id}`, // Unique user ID
                    type: "user",
                    name: null,
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    orgId: `org-${orgId}`, // Link to organization
                });
            });
            return users;
        } catch (error) {
            console.error(`Error fetching users for organization ${orgId}:`, error);
            return [];
        }
    };

    const columns = [
        {
            field: "name",
            headerName: "Name",
            width: 300,
            renderCell: (params) => {
                if (params.row.type === "organization") {
                    return (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <IconButton
                                size="small"
                                onClick={() => toggleExpandCollapse(params.row.id.split("-")[1])}
                            >
                                {expandedOrgIds[params.row.id.split("-")[1]] ? (
                                    <Iconify icon="bx:down-arrow" />
                                ) : (
                                    <Iconify icon="bx:right-arrow" />
                                )}
                            </IconButton>
                            <Typography variant="body1">{params.row.name}</Typography>
                        </Box>
                    );
                } else if (params.row.type === "header") {
                    return (
                        <Box sx={{ pl: 4, bgcolor: "rgba(0, 0, 0, 0.04)" }}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Name</Typography>
                        </Box>
                    );
                } else if (params.row.type === "user") {
                    return (
                        <Box sx={{ pl: 4, bgcolor: "rgba(0, 0, 0, 0.04)" }}>
                            <Typography variant="body2">{`${params.row.first_name} ${params.row.last_name}`}</Typography>
                        </Box>
                    );
                }
                return null;
            },
        },
        {
            field: "email",
            headerName: "# Users",
            width: 300,
            renderCell: (params) => {
                if (params.row.type === "user") {
                    return (
                        <Box sx={{ pl: 4, bgcolor: "rgba(0, 0, 0, 0.04)" }}>
                            <Typography variant="body2">{params.row.email}</Typography>
                        </Box>
                    );
                } else if (params.row.type === "header") {
                    return (
                        <Box sx={{ pl: 4, bgcolor: "rgba(0, 0, 0, 0.04)" }}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Email</Typography>
                        </Box>
                    );
                } else {
                    return (
                        <Box sx={{ pl: 4, bgcolor: "rgba(0, 0, 0, 0.04)" }}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{params.row.users}</Typography>
                        </Box>
                    )
                }
                return null;
            },
        },
        {
            field: "subscription",
            headerName: "Subscription",
            width: 300,
            renderCell: (params) => {
                if (params.row.type === "user") {
                    return (null);
                } else if (params.row.type === "header") {
                    return null;
                } else {
                    return (
                        <Box sx={{ pl: 4, bgcolor: "rgba(0, 0, 0, 0.04)" }}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{'subscription' in params.row ? (params.row.subscription?.status ?? (params.row.free_mode ? 'free' : 'none')) : ""}</Typography>
                        </Box>
                    )
                }
            },
        },
        {
            field: "actions",
            headerName: "Actions",
            width: 300,
            renderCell: (params) => {
                if (params.row.type === "user") {
                    return (null);
                } else if (params.row.type === "header") {
                    return null;
                } else {
                    return (
                        <Box sx={{ pl: 4, bgcolor: "rgba(0, 0, 0, 0.04)" }}>
                            <Menu>
                                {({ isOpen }) => (
                                    <>
                                        {/* Menu Button */}
                                        <MenuButton as={Button} rightIcon={(isOpen ? <ChevronDownIcon/> : <ChevronRightIcon />)}>
                                            {isOpen ? "Actions" : "Actions"}
                                        </MenuButton>

                                        {/* Menu List with resolved background visibility */}
                                        <Portal>
                                            <MenuList
                                                zIndex="popover" // Chakra's default popover zIndex
                                                bg="rgb(41, 48, 62)" // Ensure background is explicitly set
                                                boxShadow="lg"
                                                p={2}// Add a shadow to make it pop
                                                borderRadius="md" // Optional: Rounded edges for better UI
                                            >
                                                <MenuItem onClick={() => {
                                                    handleCopy(params.row.id)
                                                }}>Copy Org ID</MenuItem>
                                                <MenuItem onClick={() => {
                                                    toggleFreeMode(params.row.organization_id, !params.row.free_mode)
                                                }}>{params.row.free_mode ? ("Disable") : "Activate"} Free Mode</MenuItem>
                                            </MenuList>
                                        </Portal>
                                    </>
                                )}
                            </Menu>
                        </Box>
                    )
                }
            },
        },
    ];

    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    const handleCopy = async (text) => {
        try {
            await navigator.clipboard.writeText(text); // Copy the text to the clipboard
            toast({
                title: 'Copied to clipboard',
                description: "Successfully copied: " + text + " to clipboard!",
                status: 'success',
                duration: 9000,
                isClosable: true,
            })
        } catch (error) {
            toast({
                title: 'Failed to copy',
                description: "Failed to copy: " + text + " to clipboard!",
                status: 'error',
                duration: 9000,
                isClosable: true,
            })
            console.error("Failed to copy text: ", error);
        }
    };


    return (
        <Box sx={{ height: 600, width: "100%" }} p={5}>
            <ThemeProvider theme={colorMode.colorMode === "dark" ? darkTheme : theme}>
                <Typography variant="h4" gutterBottom>
                    Admin Panel
                </Typography>
                {loading ? (
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            height: "100%",
                        }}
                    >
                        <CircularProgress />
                    </Box>
                ) : (
                    <DataGridPro
                        rows={rows}
                        columns={columns}
                        rowCount={rowCountState}
                        paginationMode="server"
                        pagination
                        onPaginationModelChange={(newModel) => {
                            setCurrentPage(newModel.page)
                            setPageSize(newModel.pageSize)
                        }}
                        initialState={{
                            pagination: {
                                page: 0,
                                pageSize: 15,
                            }
                        }}
                        paginationModel={{
                            page: currentPage,
                            pageSize: pageSize,
                        }}
                        pageSizeOptions={[5, 10, 15, 20]}
                        onPageSizeChange={(newPageSize) => setPageSize(newPageSize)}
                        loading={loading}
                        getRowId={(row) => row.id}
                    />
                )}
            </ThemeProvider>
        </Box>
    );
}