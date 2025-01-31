import {
    HStack,
    Text,
    VStack,
    IconButton,
    Button,
    Link,
    Badge,
    chakra,
    Box,
    Wrap,
    useColorMode,
    Stack
} from "@chakra-ui/react";
import {DataGridPro, GridColumnHeaderItem, GridHeader, useGridApiContext, useGridApiRef} from '@mui/x-data-grid-pro';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { red } from '@mui/material/colors';
import { createTheme, useColorScheme } from '@mui/material/styles';

import EditableTitle from "./EditableTitle";
import ConfirmButton from "./ConfirmButton";
import DataGridColumnMenu from './DataGridColumnMenu'
import {useContext, useEffect, useState} from "react";
import Iconify from "./Iconify";
import { deepCompare, deepCopy } from "../util/objectUtil";
import { httpsCallable } from "firebase/functions";
import { functions } from '../firebase';
import {ColumnDataContext, CurrentReportContext, goFetch} from "../App";
import { buildColumnOptions, buildColumns } from "./ColumnConfig";
import {useUser} from "../routing/AuthGuard";
import ReportToolbar from "./ReportToolbar";

// const ChakraDataGrid = chakra(DataGrid);

// MUI theme for the data grid
export

// compares the state of the report to the saved version to see if we should show save button
const compareState = (
    initialColumnOrder, columnOrder, 
    initialFilterValues, filterValue,
    initialSortModel, sortModel
  ) => {
    return (
    deepCompare(initialColumnOrder, columnOrder) &&
    deepCompare(initialFilterValues, filterValue) && deepCompare(initialSortModel, sortModel)
    )
  }

function array_move(arr, old_index, new_index) {
    if (new_index >= arr.length) {
        var k = new_index - arr.length + 1;
        while (k--) {
            arr.push(undefined);
        }
    }
    arr.splice(new_index, 0, arr.splice(old_index, 1)[0]);
    return arr; // for testing
}

const initialPagination = {
    page: 0,
    pageSize: 20,
}
export const theme = createTheme({
    cssVariables: true,
    palette: {
        primary: {
            main: '#329795',
        },
        secondary: {
            main: '#4049d3',
        },
        error: {
            main: red.A400,
        },

    },
});
export const darkTheme = createTheme({
    cssVariables: true,
    palette: {
        mode: 'dark',
        primary: {
            main: '#37ada7',
        },
        secondary: {
            main: '#4049d3',
        },
        error: {
            main: red.A400,
        },
        text: {
            primary: '#fff',
            secondary: 'rgba(255, 255, 255, 0.7)',
            disabled: 'rgba(255, 255, 255, 0.5)',
            icon: 'rgba(255, 255, 255, 0.5)'
        }
    },
});
export default function MuiDataGridController({initialReportName, initialColumnOrder, initialSortModel, initialFilterValues, onSave, onSaveNew, onDelete, onOpenArtist}) {

    // contexts
    const {statisticTypes, linkSources, tagTypes, users, existingTags} = useContext(ColumnDataContext);
    const {currentRows, setCurrentRows, currentQueryModel, setCurrentQueryModel} = useContext(CurrentReportContext);
    const user = useUser()
    const {colorMode} = useColorMode();
    // data
    const getArtists = (data) => {
        console.log(data)
        return goFetch(user, 'GET', 'artists', data)
    }
    const [dataIsLoading, setDataIsLoading] = useState(false)

    // report state
    const [paginationModel, setPaginationModel] = useState(deepCopy(currentQueryModel?.pagination ?? initialPagination));
    const [sortModel, setSortModel] = useState(deepCopy(currentQueryModel?.sorts ?? initialSortModel));
    const [filterModel, setFilterModel] = useState(deepCopy(currentQueryModel?.filters ?? initialFilterValues))
    const [columnOrder, setColumnOrder] = useState(deepCopy(currentQueryModel?.columnOrder ?? initialColumnOrder))
    if (!initialFilterValues?.hasOwnProperty('items')) {
        initialFilterValues = {items: []}
    }

    // helpers
    const [currentReqTime, setCurrentReqTime] = useState(null)
    const apiRef = useGridApiRef();

    // reload data when pagination, sort, or filter changes
    useEffect(() => {
        const fetcher = async () => {
            setDataIsLoading(true)
            const startTime = Date.now()
            setCurrentReqTime(startTime)
            // fetch data from server
            const objectsEqual = (o1, o2) =>
                typeof o1 === 'object' && typeof o2 === 'object' && Object.keys(o1).length > 0
                    ? Object.keys(o1).length === Object.keys(o2).length
                    && Object.keys(o1).every(p => objectsEqual(o1[p], o2[p]))
                    : o1 === o2;

            const arraysEqual = (a1, a2) =>
                a1.length === a2.length && a1.every((o, idx) => objectsEqual(o, a2[idx]));

            const resp = await getArtists({
                page: paginationModel.page,
                pageSize: paginationModel.pageSize,
                sortModel,
                filterModel
            });

            setDataIsLoading(false)

            if (resp.page !== paginationModel.page || resp.pageSize !== paginationModel.pageSize) {
                return
            }

            if (!arraysEqual(resp.filterModel?.items ?? [], filterModel?.items ?? [])) {

                return
            }
            if (JSON.stringify(resp.sortModel) !== JSON.stringify(sortModel) && !objectsEqual(resp.sortModel, sortModel)) {
                return
            }
            setCurrentRows({
                time: startTime,
                rows: resp.rows,
                rowCount: resp.rowCount
            });
        };
        let refreshNeeded = false;
        if (currentRows === null || currentQueryModel === null) {
            refreshNeeded = true;
        } else {
            if (JSON.stringify(currentQueryModel?.filters ?? initialFilterValues) !== JSON.stringify(filterModel)) {
                refreshNeeded = true
            } else if (JSON.stringify(currentQueryModel?.sorts ?? []) !== JSON.stringify(sortModel)) {
                refreshNeeded = true
            } else if (JSON.stringify(currentQueryModel?.pagination ?? initialPagination) !== JSON.stringify(paginationModel)) {
                refreshNeeded = true
            }

        }
        const updateModel = {
            filters: filterModel,
            sorts: sortModel,
            pagination: paginationModel,
            columnOrder: currentQueryModel?.columnOrder ?? null,
        }
        setCurrentQueryModel(updateModel)

        if (refreshNeeded) {
            // console.log(updateModel, 'fetching')
            fetcher();
        }
    }, [paginationModel, sortModel, filterModel]);
    // saves state for report config (currently only works for add/remove column, rest (reorder, filter, sort) are TODO)

    const [reportName, setReportName] = useState(initialReportName)

    // update the current query model when the column order changes
    useEffect(() => {
        const updateModel = {
            columnOrder: columnOrder,
            ...(currentQueryModel ?? {}),
        }
        setCurrentQueryModel(updateModel)
        localStorage.setItem('currentQueryModel', JSON.stringify(updateModel))
    }, [columnOrder, initialFilterValues]);

    const quickFilter = (field, operator, value) => {
        let set = false
        const newFilterModel = deepCopy(filterModel ?? {})
        filterModel?.items?.forEach((item, index) => {
            if (item.field === field) {
                if (operator === 'isAnyOf') {
                    value = [
                        ...item.value ?? [],
                        value
                    ]
                }
                newFilterModel.items[index] = {
                    ...item,
                    operator: operator,
                    value: value,

                }
                set = true
            }
        })
        if (!set) {
            newFilterModel.items.push({
                field,
                operator,
                value,
                id: Date.now()
            })
        }
        setFilterModel(newFilterModel)

    }

    // reset to the saved version of the report
    const revertState = () => {
        setColumnOrder(deepCopy(initialColumnOrder))
        setFilterModel(deepCopy(initialFilterValues))
        setSortModel(deepCopy(initialSortModel))
        setCurrentQueryModel(null)
        setReportName(initialReportName)
    }

    const handleColumnOrderChange = (change) => {
        const column = change.column.field
        setColumnOrder(array_move(deepCopy(columnOrder), change.oldIndex - 1, change.targetIndex - 1))

    }
    useEffect(() => {

    }, [existingTags, users])


    // bake the columns for MUI based on current column order object
    const columns = buildColumns(columnOrder, quickFilter, statisticTypes, linkSources, tagTypes, users, existingTags)

    // check current state vs saved report config to see if we should show save button
    const hasBeenEdited = reportName !== initialReportName || !compareState(initialColumnOrder, columnOrder, initialFilterValues, filterModel, initialSortModel, sortModel)

    // console.log(currentRows?.rows)
    return (

        <VStack spacing={5} align="left">
            <Stack px={6} justifyContent='space-between' direction={{base: 'column', md: 'row'}}>
                <VStack spacing={3} align="left">
                    <EditableTitle value={reportName} setValue={setReportName}/>
                    <Text size="sm" color="text.subtle">Artist Report</Text>
                </VStack>
                <HStack>
                    {onSaveNew &&
                        <ConfirmButton button={<IconButton variant='outline' icon={<Iconify icon="mdi:trash"/>}/>}
                                       title="Delete artist report"
                                       body="Are you sure you want to delete this report?"
                                       affirmative="Delete"
                                       onAffirm={onDelete}
                        />
                    }
                    <DataGridColumnMenu columnOrder={columnOrder}
                                        columnOptions={buildColumnOptions(statisticTypes, linkSources)}
                                        setColumnOrder={setColumnOrder}/>
                    {(hasBeenEdited && onSaveNew) &&
                        <Button colorScheme='primary' variant='outline' onClick={revertState}>Revert</Button>}
                    {hasBeenEdited && <Button colorScheme='primary'
                                              onClick={() => onSave(columnOrder, filterModel, reportName, sortModel)}>Save</Button>}
                    {(hasBeenEdited && onSaveNew) && <Button colorScheme='primary'
                                                             onClick={() => onSaveNew(columnOrder, filterModel, reportName, sortModel)}>Save
                        as New</Button>}
                </HStack>

            </Stack>
            <Box width="calc(100vw - 300px)" maxWidth={'100%'} minWidth={"750px"}>
                {/* This is MUI */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        height: 'calc(100vh - 175px)',
                        minHeight: '750px'

                    }}
                >
                    <ThemeProvider theme={colorMode === 'dark' ? darkTheme : theme}>
                        {/* CssBaseline kickstart an elegant, consistent, and simple baseline to build upon. */}
                        {/* <CssBaseline /> */}

                        <DataGridPro
                            columns={columns}
                            loading={dataIsLoading}
                            rows={currentRows?.rows ?? []}
                            sortingMode="server"
                            filterMode="server"
                            paginationMode="server"
                            onSortModelChange={setSortModel}
                            onFilterModelChange={setFilterModel}
                            onColumnOrderChange={handleColumnOrderChange}
                            checkboxSelection disableRowSelectionOnClick
                            pagination
                            ref={apiRef}
                            onCellClick={(e) => {
                                if (e.field === 'name') {
                                    const artist = currentRows?.rows?.filter((row) => row?.id == e.id).pop()
                                    onOpenArtist(artist)
                                }
                            }}
                            rowCount={currentRows?.rowCount ?? 0}
                            filterModel={filterModel}
                            sortModel={sortModel}
                            onPaginationModelChange={setPaginationModel}
                            paginationModel={paginationModel}
                            initialState={{
                                pagination: currentQueryModel?.pagination ?? initialPagination,
                            }}
                            pageSizeOptions={[10, 20, 50, 100, 200]}
                            // slots={{
                            //     toolbar: ReportToolbar,
                            // }}
                        />

                    </ThemeProvider>
                </div>
            </Box>
            {/* End MUI */}
        </VStack>
    )
}