import React, { useEffect, useState } from "react";
import {Box, Typography, CircularProgress, IconButton, Chip} from "@mui/material";
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

export default function PageAdmin({}) {
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
    const [layoutRef] = useOutletContext()
    const [selectedOrgDelete, setSelectedOrgDelete] = useState(null); // For tracking organization to delete
    const {
        isOpen: isDeleteOpen,
        onOpen: onDeleteOpen,
        onClose: onDeleteClose,
    } = useDisclosure(); // For Delete Confirmation Modal

    useEffect(() => {
        fetchOrganizations();
    }, [currentPage, pageSize]);

    const fetchSubAPI = async(orgIds, theRows) => {

        console.log("Fetching ", orgIds)
        setExpandedOrgIds({})

        goFetch(user, 'POST', 'admin-organizations', {ids: orgIds}).then((response) => {
            const newRows = [...theRows];
            for (let org of response) {

                const index = newRows.findIndex(item => (item.organization_id ?? "NA") === org.id && item.type === 'organization');

                // Check if the item exists
                if (index !== -1) {
                    // Update the item with the new values
                    newRows[index] = { ...newRows[index], ...{"subscription": org.subscription, "users": org.users, "active_artists": org.active_artists, "inactive_artists": org.inactive_artists} };
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

    const handleDeleteClick = (org) => {
        setSelectedOrgDelete(org); // Store selected organization ID
        onDeleteOpen(); // Open confirmation modal
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
    console.log(layoutRef)

    const columns = [
        {
            field: "name",
            headerName: "Name",
            headerClassName: "admin-header",
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
                        <Box sx={{ pl: 4}}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Name</Typography>
                        </Box>
                    );
                } else if (params.row.type === "user") {
                    return (
                        <Box sx={{ pl: 4}}>
                            <Typography variant="body2">{`${params.row.first_name} ${params.row.last_name}`}</Typography>
                        </Box>
                    );
                }
                return null;
            },
        },

        {
            field: "artists",
            headerName: "# Artists",
            headerClassName: "admin-header",
            width: 300,
            renderCell: (params) => {


                if (params.row.type === "user") {
                    return (
                        <Box sx={{ pl: 4}}>
                            <Typography variant="body2">{params.row.email}</Typography>
                        </Box>
                    );
                } else if (params.row.type === "header") {
                    return (
                        <Box sx={{ pl: 4}}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Email</Typography>
                        </Box>
                    );
                } else {
                    return (
                        <Box sx={{}}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{(params.row?.active_artists ?? null) === null ? null : ((params.row.active_artists + params.row.inactive_artists) +" ("+params.row.active_artists +" active)")}</Typography>
                        </Box>
                    )
                }
            },
        },
        {
            field: "email",
            headerName: "# Users",
            headerClassName: "admin-header",
            width: 300,
            renderCell: (params) => {
                if (params.row.type === "user") {
                    return null;
                } else if (params.row.type === "header") {
                    return null;
                } else {
                    return (
                        <Box>
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
            headerClassName: "admin-header",
            width: 300,
            renderCell: (params) => {
                if (params.row.type === "user") {
                    return (null);
                } else if (params.row.type === "header") {
                    return null;
                } else {
                    const substatus = 'subscription' in params.row ? (params.row.subscription?.status ?? (params.row.free_mode ? 'free' : 'none')) : null
                    if (!substatus) {
                        return (<LoadingWidget iconSize={'25px'}/>)
                    }

                    return (
                        <Box sx={{ }}>
                            <Chip variant={'outlined'} color={substatus === 'free' ? 'warning' : (substatus === 'none' ? 'error' : 'success')} label={substatus.ucwords()}/>
                        </Box>
                    )
                }
            },
        },
        {
            field: "actions",
            headerName: "Actions",
            headerClassName: "admin-header",
            width: 250,
            renderCell: (params) => {
                if (params.row.type === "user") {
                    return (null);
                } else if (params.row.type === "header") {
                    return null;
                } else {
                    return (
                        <Box >
                            <ChakraProvider theme={chakraTheme}>

                            <Menu computePositionOnMount={true}>
                                {({ isOpen }) => (
                                    <>
                                        {/* Menu Button */}
                                        <MenuButton as={Button} rightIcon={( <Iconify size={'10px'} icon={'bx:down-arrow'}/>)}>
                                            {isOpen ? "Actions" : "Actions"}
                                        </MenuButton>

                                        {/* Menu List with resolved background visibility */}
                                        <Portal containerRef={layoutRef}>
                                            <MenuList>
                                                <MenuItem className={'menu-item-org'} onClick={() => handleCopy(params.row.id)}>
                                                    Copy Org ID
                                                </MenuItem>
                                                <MenuItem className={'menu-item-org'} onClick={() => toggleFreeMode(params.row.organization_id, !params.row.free_mode)}>
                                                    {params.row.free_mode ? ("Disable") : "Activate"} Free Mode
                                                </MenuItem>
                                                <MenuItem className={'menu-item-org'} onClick={() => handleDeleteClick(params.row)}>
                                                    <Iconify icon={'mdi:trash'}/> Delete
                                                </MenuItem>
                                            </MenuList>
                                        </Portal>
                                    </>
                                )}
                            </Menu>
                            </ChakraProvider>

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
    const [name, setName] = useState(""); // Form state for organization name
    const [freeMode, setFreeMode] = useState(false); // Form state for free_mode checkbox
    const { isOpen, onOpen, onClose } = useDisclosure(); // Chakra UI modal helpers

    const deleteOrganization = async () => {
        const index = rows.findIndex(item => (item.organization_id ?? "NA") === selectedOrgDelete.organization_id && item.type === 'organization');
        if (index === -1) {
            toast({
                title: "Organization has Users",
                description: "Cannot delete organization with users.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });

            onDeleteClose(); // Close the modal
            setSelectedOrgDelete(null); // Reset selected organization ID
            return;
        }
        const org = rows[index]
        if (org.users === null || org.users > 0) {
            toast({
                title: "Organization has Users",
                description: "Cannot delete organization with users.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });

            onDeleteClose(); // Close the modal
            setSelectedOrgDelete(null); // Reset selected organization ID
            return;
        }
        try {
            // Reference to the organization document
            const docRef = doc(db, "organizations", selectedOrgDelete.organization_id);

            // Delete the document
            await deleteDoc(docRef);

            // Show success toast
            toast({
                title: "Organization deleted",
                description: "The organization has been successfully deleted.",
                status: "success",
                duration: 5000,
                isClosable: true,
            });

            onDeleteClose(); // Close the modal
            setSelectedOrgDelete(null); // Reset selected organization ID
            fetchOrganizations(); // Refresh the organization list
        } catch (error) {
            console.error("Error deleting organization:", error);

            // Show error toast
            toast({
                title: "Error",
                description: "Failed to delete the organization. Please try again.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        }
    };

    const createOrganization = async (orgName, isFreeMode) => {
        // Replace this with your API or function to handle organization creation
        console.log("Creating organization with:", orgName, isFreeMode);
        try {
            const orgRef = collection(db, "organizations");

            // Add a new document with the given name and free_mode
            await addDoc(orgRef, {
                name: orgName,
                free_mode: isFreeMode,
            });
        } catch (error) {
            console.error("Error adding organization:", error);

            // Show error toast
            toast({
                title: "Error",
                description: "Failed to add organization. Please try again.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        }

        // Example: Show a toast notification
        toast({
            title: "Organization created successfully!",
            description: `Organization ${orgName} has been added.`,
            status: "success",
            duration: 5000,
            isClosable: true,
        });
        onClose(); // Close the modal
        setName(""); // Reset form fields
        setFreeMode(false); // Reset the free_mode checkbox
        fetchOrganizations(); // Refresh the organization list
    };
    const styles = {
        userRow: {
            backgroundColor: "#f7f7f7", // Light gray to indicate it's a lower-level row
        },
        headerRow: {
            backgroundColor: "#e0e0e0", // Slightly darker gray for headers
        },
    };
    return (
        <Box sx={{ height: '80vh', width: "100%" }} p={5}>
            <Modal isOpen={isDeleteOpen} onClose={onDeleteClose}>
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Confirm Deletion</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        Are you sure you want to delete the organization: "{selectedOrgDelete?.name}"? This action cannot be undone.
                    </ModalBody>
                    <ModalFooter>
                        <Button onClick={onDeleteClose} mr={3}>
                            Cancel
                        </Button>
                        <Button colorScheme="red" onClick={deleteOrganization}>
                            Delete
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            <Modal isOpen={isOpen} onClose={onClose}>
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Add New Organization</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        {/* Name Input */}
                        <FormControl id="organizationName" isRequired mb={4}>
                            <FormLabel>Name</FormLabel>
                            <Input
                                placeholder="Enter organization name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </FormControl>
                        {/* Free Mode Checkbox */}
                        <FormControl id="freeMode">
                            <Checkbox
                                isChecked={freeMode}
                                onChange={(e) => setFreeMode(e.target.checked)}
                            >
                                Free Mode
                            </Checkbox>
                        </FormControl>
                    </ModalBody>
                    <ModalFooter>
                        {/* Cancel Button */}
                        <Button onClick={onClose} mr={3}>
                            Cancel
                        </Button>
                        {/* Create Button */}
                        <Button
                            colorScheme="blue"
                            onClick={() => createOrganization(name, freeMode)}
                            isDisabled={!name.trim()} // Disable button if name is empty
                        >
                            Create
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            <HStack align={'center'} justifyContent={'space-between'} mb={1}>
                <Heading >
                    Admin Panel
                </Heading>
                {/* Add Organization Button */}
                <Button colorScheme="blue" onClick={onOpen} mb={4}>
                    Add Organization
                </Button>
            </HStack>
            <ThemeProvider theme={colorMode.colorMode === "dark" ? darkTheme : theme}>


                {/* Chakra Modal */}

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
                        getRowClassName={(params) => {
                            if (params.row.type === "user") {
                                return "user-row " + colorMode.colorMode; // Add a specific class for user rows
                            } else if (params.row.type === "header") {
                                return "header-row " + colorMode.colorMode; // Optionally, a class for header rows
                            }
                            return "org-row " + colorMode.colorMode; // Default (no additional class)
                        }}
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
                        isRowSelectable={() => false}
                        sx={{'& .admin-header .MuiDataGrid-columnHeaderTitle': {
                                fontWeight: '900',
                            }}}
                        getRowHeight={(params) => ((params.model.type === "user" || params.model.type === "header") ? 40 : null)}
                    />
                )}
            </ThemeProvider>
        </Box>
    );
}