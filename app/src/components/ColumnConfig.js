import {
    Box, Text, Wrap
} from '@chakra-ui/react';
import Iconify from '../components/Iconify';
import numeral from 'numeral';
import { Sparklines, SparklinesLine } from 'react-sparklines';
import { Chip, Link as MUILink, Tooltip } from '@mui/material';
import { getGridDateOperators } from "@mui/x-data-grid-pro";
import Moment from 'react-moment';
import moment from 'moment';
import { deepCopy } from "../util/objectUtil";


// Defaults

export const defaultReportName = "New artist report"

export const defaultColumnOrder = ['link_spotify', 'evaluation.status', 'evaluation.distributor', 'evaluation.back_catalog', 'statistic.30-latest', 'organization.created_at', 'users']

export const defaultFilterModel = {items:[]}

const dateOperators = getGridDateOperators().filter(
    (operator) => operator.value !== 'is' && operator.value !== 'not' && operator.value !== 'isEmpty' && operator.value !== 'isNotEmpty',
);

// base column (ie the first column) for the grid
export const columnBootstrap = [
    {
        field: 'name',
        headerName: "Artist",
        disableReorder: true,
        order: 0,
        flex: 1,
        minWidth: 150,
        cellClassName: 'hover-cell',
        renderCell: (params) => (<strong>{params.value}</strong>)
    }
]

export const staticColumnFactory = (colId, quickFilter, existingTags) => {
    if (colId == "evaluation.distributor") return {
      field: 'evaluation.distributor',
      valueGetter: (data) => data.row?.evaluation?.distributor ?? 'N/A',
      headerName: 'Distributor',
      isMetric: false,
      minWidth: 150,
      defaultFilter: {
        type: 'string',
        operator: 'startsWith',
      }
    }
    if (colId == "evaluation.label" ) return {
      field: 'evaluation.label',
      valueGetter: (data) => data.row?.evaluation?.label ?? 'N/A',
      headerName: 'Label',
      isMetric: false,
      minWidth: 150,
      defaultFilter: {
        type: 'string',
        operator: 'startsWith',
      }
    }
    if (colId == "evaluation.status" ) return {
      field: 'evaluation.status',
      headerName: 'Status',
      isMetric: false,
      valueGetter: (data) => (data?.row?.evaluation?.status ?? null),
      valueOptions: [
        {value: 1, label: 'Signed'}, {value: 0, label: 'Unsigned'}, {value: null, label: 'Unknown'}
      ],
      type: 'singleSelect',
      renderCell: (params) => (
        <Chip
            onClick={() => {
                quickFilter('evaluation.status', 'is', params.value)
            }}
            variant="outlined" size='small' color={params.value == 1 ? "error" : params.value == 0 ? "primary" : "warning"} label={params.value == 0 ? 'Unsigned' : (params.value == 1 ? 'Signed' : 'Unknown')} />
        )
    }
    if (colId == "evaluation.distributor_type") return {
      field: 'evaluation.distributor_type',
      type: 'singleSelect',
      headerName: 'Distributor Type',
      valueGetter: (data) => data.row.evaluation ? data.row.evaluation?.distributor_type : null,
      isMetric: false,
      valueOptions: [
        {value: 0, label: 'DIY'}, {value: 2, label: 'Major'}, {value: 1, label: 'Indie'}, {value: null, label: 'Unknown'}
      ],
      renderCell: (params) => (
        <Chip variant="outlined" size='small'
              onClick={() => {
                  quickFilter('evaluation.distributor_type', 'is', params.value)
              }}
              color={params.value === 2 ? "error" : (params.value === 1|| params.value == null ? "warning" : "primary")}
              label={params.value !== null ? (params.value === 0 ? "DIY" : (params.value === 1 ? "Indie" : "Major")) : "Unknown"}/>

        )
    }
    if (colId == "evaluation.back_catalog") return {
      field: 'evaluation.back_catalog',
      headerName: 'Backcatalog Status',
      valueGetter: (data) => (data.row?.evaluation?.back_catalog ?? null),
      isMetric: false,
      // filterEditor: SelectFilter,
      valueOptions: [
         {value: 0, label: 'Clean'}, {value: 1, label: 'Dirty'}
      ],
      type: 'singleSelect',
      renderCell: (params) => (
        <Chip
            onClick={() => {
                quickFilter('evaluation.back_catalog', 'is', params.value)
            }}
            variant="outlined" size='small' color={params.value == 1 ? "warning" : "primary"} label={(params.value == null ? 'Unknown' : (params.value == 0 ? 'Clean' : 'Dirty'))} />
        )
    }
    if (colId == "organization.created_at") return {
      field: 'organization.created_at',
      headerName: 'Added On',
      filterOperators: dateOperators,
      width: 150,
      valueGetter: (data) => {
        return (new Date(data.row?.organization?.created_at) ?? null)
      },
      isMetric: false,
      type: 'dateTime',
      renderCell: (params) => (<Moment format={"lll"}>{params?.value}</Moment>),
    }
    if (colId == "users") return {
      field: 'users',
      headerName: 'Added By',
      sortable: false,
      isMetric: false,
      width: 250,
      type: 'singleSelect',
      renderCell: (params) => (
        <Box flex flexWrap={'no-wrap'} flexDirection={'row'} align={'center'} justifyContent={'flex-start'}>
              {params.value.map((item, index) => {
                  return <Tooltip  key={"user-"+item.id+"-"+item.artist_id}  title={"Added on: " + moment(item.created_at).format("lll")}><Chip onClick={() => {
                      quickFilter('users', 'is', item.id)
                  }} sx={{marginLeft: (index > 0 ? '5px' : '0')}} variant="outlined" size='small' color={"info"} label={item.first_name + " " + item.last_name}/>
                  </Tooltip>
              })}
          </Box>
      )
    }
    if (colId == "tags") {
        const valueOptions = []
        if (existingTags) {
            const filtered = existingTags.filter((tag) => {
                return tag.tag_type_id === 1
            }).map((tag) => {
                return {
                "label": tag.tag,
                "value": tag.tag
                }
            })
            for (const tag of filtered) {
                valueOptions.push(tag)
            }
        }
        return {
            field: "tags.user",
            type: 'singleSelect',
            headerName: "Tags",
            description:  "Tags",
            sortable: false,
            valueGetter: (data) => data.row?.tags.filter((tag) => tag.tag_type_id === 'user') ?? [],
            valueOptions: valueOptions,
            renderCell: (params) => {
            return (
                <Wrap>
                    {params.value.map((item) => {
                    return <Chip key={"tag-"+item.id} variant="outlined" size='small'
                                    color={"info"}
                                    label={item.tag}/>
                    })}
                </Wrap>
            )
            },
            isMetric: false
        }
    }
    return {
        field: colId
    }
}

// definitions for statistic columns
export const statisticColumnTemplates = {
    "latest": {
        _subfield: 'latest',
        _display: "TP",
        options: {
            type: 'number',
            sortable: true,
            renderCell: (params) => <span>{params.value !== null ? numeral(params.value).format('0.0 a') : 'N/A'}</span>
        }
    },
    "previous": {
        _subfield: 'previous',
        _display: "LP",
        options: {
            type: 'number',
            sortable: true,
            renderCell: (params) => <span>{params.value !== null ? numeral(params.value).format('0.0 a') : 'N/A'}</span>
        }
    },
    "week_over_week": {
        _subfield: 'week_over_week',
        _display: "WOW",
        options: {
            type: 'number',
            sortable: true,
            renderCell: (params) => <span>{params.value !== null ? numeral(params.value).format('0.00%') : 'N/A'}</span>
        }
    },
    "month_over_month": {
        _subfield: 'month_over_month',
        _display: "MOM",
        options: {
            type: 'number',
            sortable: true,
            renderCell: (params) => <span>{params.value !== null ? numeral(params.value).format('0.00%') : 'N/A'}</span>
        }
    },
    "data": {
        _subfield: 'data',
        _display: "Trend",
        options: {
            type: 'number',
            sortable: false,
            renderCell: (params) => {
            return (
            <div style={{width:"100%", paddingTop: "5px"}}>
            <Sparklines data={params.value ? params.value : []} min={0} height={50} width={params.colDef.width}>
                <SparklinesLine color="#329795" />
            </Sparklines>
            </div>
            )},
        }
    }
  
}

// creates the column def for a given link type
export const linkColumnFactory = (suffix, linkDef) => {
    return {
        field: "link_" + suffix,
        keyName: "link_" + suffix,
        social: linkDef['social'],
        filterable: false,
        sortable: false,
        headerName: linkDef['display_name'] + ' Link',
        description:  linkDef['display_name'] + ' Link',
        valueOptions: [
        {value: 0, label: 'DIY'}, {value: 2, label: 'Major'}, {value: 1, label: 'Indie'}
        ],
        renderHeader: (params) => (
            <Tooltip title={linkDef['display_name'] + ' Link'}>
            <Wrap align={'center'}>
                {linkDef['logo'] ? <Iconify sx={{display: 'inline-block'}} icon={linkDef['logo']}></Iconify> : null}
                Link
            </Wrap>
            </Tooltip>
        ),
        renderCell: (params) => ( <MUILink color='primary' href={params.value}>{linkDef['display_name']} <Iconify icon="mdi:external-link" sx={{display:'inline-block'}} /></MUILink> ),
        isMetric: false
    }
}

// creates the column def for a given statistic type
export const statisticColumnFactory = (statId, func, statDef, linkDef) => {
    const funcTemplate = statisticColumnTemplates[func]
    const sourceName = statDef['source'].charAt(0).toUpperCase() + statDef['source'].slice(1);
    return {
        field: "statistic." + statId + "-" + func,
        headerName: sourceName + " " + funcTemplate['_display'],
        description: sourceName +' ' + statDef['name'],
        valueGetter: (data) => {
            // find the entry in data.row['statistics'] where statistic_type_id == statId, return that object['func'] otherwise return null
            const stat = data.row['statistics'].find((stat) => stat['statistic_type_id'] == statId)
            return stat ? stat[func] : null
        },
        renderHeader: (params) => (
            <Tooltip title={linkDef['display_name'] + ' ' + funcTemplate['_display']}>
                <Box flex align={'center'} flexWrap={"nowrap"}>
                {linkDef && linkDef['logo'] ? <Iconify sx={{display: 'inline-block'}} icon={linkDef['logo']}></Iconify> : null}
                <Text display={'inline-block'}>&nbsp;{funcTemplate['_display']}</Text>
                </Box>
            </Tooltip>
        ),
        ...funcTemplate['options']
    }
}


export const buildColumns = (columnOrder, quickFilter, statisticTypes, linkSources, tagTypes, users, existingTags) => {
    const getLinkDef = (link) => {
        return linkSources?.filter((source) => source['key'] == link)[0]
    }

    const getStatisticsDef = (statID) => {
        return statisticTypes?.filter((stat) => stat['id'] == statID)[0]
    }

    // get a column definition template based on the column name
    const getColumnTemplate = (col) => {
        // if its starts with link_ then its a link column
        if (col.startsWith('link_')) {
            // get the suffix
            const suffix = col.split('_')[1]
            return linkColumnFactory(suffix, getLinkDef(suffix))
        }
        // if it starts with statistic. then its a statistic column
        if (col.startsWith('statistic.')) {
            const suffix = col.split('.')[1]
            const statId = suffix.split('-')[0]
            const func = suffix.split('-')[1]
            const statDef = getStatisticsDef(statId)
            const linkDef = getLinkDef(statDef['source'])
            return statisticColumnFactory(statId, func, statDef, linkDef)
        }
        // static
        return staticColumnFactory(col, quickFilter, existingTags)
    }

    // creates columns based on current column order
    const buildColumns = (columnOrder) => {
        const newColumns = deepCopy(columnBootstrap)
        columnOrder.forEach((col) => {
            newColumns.push(getColumnTemplate(col))
        })
        return newColumns
    }

    return buildColumns(columnOrder)
}



export const buildColumnOptions = (statisticTypes, linkSources) => {
    const columnOptions = [
        {"key": "evaluation.distributor", "display": "Distributor", "type": "simple"},
        {"key": "evaluation.label", "display": "Label", "type": "simple"},
        {"key": "evaluation.status", "display": "Status", "type": "simple"},
        {"key": "evaluation.distributor_type", "display": "Label", "type": "simple"},
        {"key": "evaluation.back_catalog", "display": "Label", "type": "simple"},
        {"key": "organization.created_at", "display": "Added On", "type": "simple"},
        {"key": "users", "display": "Added By", "type": "simple"},
        {"key": "tags", "display": "Tags", "type": "simple"},
        {
            "type": "dropdown",
            "key": "link",
            "display": "Links",
            "children": linkSources.map((source) => {
                return {
                    "key": "link_" + source['key'],
                    "display": source['display_name']
                }
            })
        }
    ]
    statisticTypes.forEach((stat) => {
        const display = stat['name']
        const id = stat['id']
        const baseKey = 'statistic.' + id
        columnOptions.push({
            "type": "dropdown",
            "key": baseKey,
            "display": display,
            "children": [
                {"key": baseKey + "-latest", "display": "Latest"},
                {"key": baseKey + "-previous", "display": "Previous"},
                {"key": baseKey + "-week_over_week", "display": "Week Over Week"},
                {"key": baseKey + "-month_over_month", "display": "Month Over Month"},
                {"key": baseKey + "-data", "display": "Trend"}
            ]
        })
    })
    return columnOptions
}