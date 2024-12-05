// import NumberFilter from '@inovua/reactdatagrid-community/NumberFilter'
// import SelectFilter from '@inovua/reactdatagrid-community/SelectFilter'

import {
  Badge, Box,
  Button,
  Link, Text, Wrap
} from '@chakra-ui/react';
import Iconify from '../components/Iconify';
// import Chart from "react-apexcharts";
import numeral from 'numeral'
import { Sparklines, SparklinesLine } from 'react-sparklines';
import {useState} from "react";
import {httpsCallable} from "firebase/functions";
import {functions} from "../firebase";
import {Chip, Link as MUILink, Tooltip} from '@mui/material';
import {getGridDateOperators} from "@mui/x-data-grid-pro";
import Moment from 'react-moment';
import moment from 'moment';
// const miniBarChartOptions = {
//   chart: {
//     type: 'line',
//     width: 60,
//     height: 10,
//     sparkline: {
//       enabled: true
//     },
//     animations: {
//       enabled: false
//     }
//   },
//   colors:['#329795'],
//   stroke: {
//     width: 2,
//     curve: "smooth"
//   },
//   tooltip: {
//     fixed: {
//       enabled: false
//     },
//     x: {
//       show: false
//     },
//     y: {
//       title: {
//         formatter: function (seriesName) {
//           return ''
//         }
//       }
//     },
//     marker: {
//       show: false
//     }
//   }
// }

export const defaultReportName = "New artist report"

export const defaultColumnOrder = ['link_spotify', 'evaluation.status', 'evaluation.distributor', 'evaluation.back_catalog', 'statistic.30-latest', 'organization.created_at', 'users']
const dateOperators = getGridDateOperators().filter(
    (operator) => operator.value !== 'is' && operator.value !== 'not' && operator.value !== 'isEmpty' && operator.value !== 'isNotEmpty',
);

export const columnOptions = {
  "evaluation.distributor": {
    field: 'evaluation.distributor',
    valueGetter: (data) => data.row?.evaluation?.distributor ?? 'N/A',
    headerName: 'Distributor',
    isMetric: false,
    minWidth: 150,
    defaultFilter: {
      type: 'string',
      operator: 'startsWith',
    }
  },
  "evaluation.label": {
    field: 'evaluation.label',
    valueGetter: (data) => data.row?.evaluation?.label ?? 'N/A',
    headerName: 'Label',
    isMetric: false,
    minWidth: 150,
    defaultFilter: {
      type: 'string',
      operator: 'startsWith',
    }
  },
  "evaluation.status": {
    field: 'evaluation.status',
    headerName: 'Status',
    isMetric: false,
    valueGetter: (data) => (data?.row?.evaluation?.status ?? null),
    valueOptions: [
      {value: 1, label: 'Signed'}, {value: 0, label: 'Unsigned'}, {value: null, label: 'Unknown'}
    ],
    type: 'singleSelect',

  },
  "evaluation.distributor_type": {
    field: 'evaluation.distributor_type',
    type: 'singleSelect',
    headerName: 'Distributor Type',
    valueGetter: (data) => data.row.evaluation ? data.row.evaluation?.distributor_type : null,
    isMetric: false,
    valueOptions: [
      {value: 0, label: 'DIY'}, {value: 2, label: 'Major'}, {value: 1, label: 'Indie'}, {value: null, label: 'Unknown'}
    ],

  },
  "evaluation.back_catalog": {
    field: 'evaluation.back_catalog',
    headerName: 'Backcatalog Status',
    valueGetter: (data) => (data.row?.evaluation?.back_catalog ?? null),
    isMetric: false,
    // filterEditor: SelectFilter,
    valueOptions: [
       {value: 0, label: 'Clean'}, {value: 1, label: 'Dirty'}
    ],
    type: 'singleSelect',
  },
  "organization.created_at": {
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
  },
  "users": {
    field: 'users',
    headerName: 'Added By',
    sortable: false,
    isMetric: false,
    width: 250,
    type: 'singleSelect'
  }
  // "genres": {
  //   field: 'tags',
  //   type: 'multiSelect',
  //   headerName: 'Genres',
  //   valueGetter: (data) => data.row?.tags ?? [],
  //   isMetric: false,
  //
  //   renderCell: (params) => {
  //     console.log(params)
  //     return (
  //         <Wrap>
  //
  //           {params.value.map((item) => {
  //             return <Chip variant="outlined" size='small'
  //                   color={"info"}
  //                   label={item.tag}/>
  //           })}
  //         </Wrap>
  //
  //     )
  //   }
  // }
  // "genres": {
  //   field: 'genres',
  //   op: input => input.length > 0 ? input[0] : "",
  //   headerName: 'Genre',
  //   isMetric: false,
  //   defaultFilter: {
  //     type: 'string',
  //     operator: 'startsWith',
  //     value: ''
  //   }
  // },
}

export const metricFunctions = {
  "latest": {
    field: 'latest',
    headerName: "Latest",
    defaultFilter: {
      type: 'number',
      operator: 'gte'
    },

    options: {
      type: 'number',
      sortable: true,
      // filterEditor: NumberFilter,
      renderCell: (params) => <span>{params.value !== null ? numeral(params.value).format('0.0 a') : 'N/A'}</span>
    }
  },
  "previous": {
    field: 'previous',
    headerName: "Previous",
    defaultFilter: {
      type: 'number',
      operator: 'gte'
    },
    options: {
      type: 'number',
      sortable: true,
      // filterEditor: NumberFilter,
      renderCell: (params) => <span>{params.value !== null ? numeral(params.value).format('0.0 a') : 'N/A'}</span>
    }
  },
  "week_over_week": {
    field: 'week_over_week',
    headerName: "Week / Week",
    defaultFilter: {
      type: 'number',
      operator: 'gte'
    },
    options: {
      type: 'number',
      sortable: true,
      // filterEditor: NumberFilter,
      renderCell: (params) => <span>{params.value !== null ? numeral(params.value).format('0.00%') : 'N/A'}</span>
    }
  },
  "month_over_month": {
    field: 'month_over_month',
    headerName: "Month / Month",
    defaultFilter: {
      type: 'number',
      operator: 'gte'
    },
    options: {
      type: 'number',
      sortable: true,
      // filterEditor: NumberFilter,
      renderCell: (params) => <span>{params.value !== null ? numeral(params.value).format('0.00%') : 'N/A'}</span>
    }
  },
  "data": {
    field: 'data',
    headerName: "Trendline",
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

export const buildColumnSelection = (columnOrder, withIndexes = false) => {
  let columnSelection = {}
  columnSelection['link'] = {};
  Object.keys(columnOptions).forEach(c => {
    let col = columnOptions[c]
    if (!col.isMetric) {
      const index = columnOrder.indexOf(c)
      if (c.startsWith('link_')) {
        columnSelection['link'][c.split('link_')[1]] =  withIndexes ? (index) : (index !== -1)
      } else {
        columnSelection[c] = withIndexes ? (index) : (index !== -1)
      }
    } else {
      columnSelection[c] = {}
      Object.keys(metricFunctions).forEach(m => {
        // c = stat_instagram__followers_total
        // m = latest
        // let orderKey = c + "-" + m
        // let selected = columnOrder.includes(c + "-" + m)
        const index =  columnOrder.indexOf('statistic.'+columnOptions[c]['statTypeId'] + "-" + m)
        columnSelection[c][m] = withIndexes ? (index) : (index !== -1)
      })
    }
  })
  return columnSelection
}

export const buildDefaultFilters = () => {
  let defaultFilters = []
  Object.keys(columnOptions).forEach(option => {
    if (columnOptions[option].isMetric) {
      Object.keys(metricFunctions).forEach(func => {
        if ('defaultFilter' in metricFunctions[func])
          defaultFilters.push({field:option+"-"+func, ...metricFunctions[func].defaultFilter})
      })
    } else {
      if ('defaultFilter' in columnOptions[option])
        defaultFilters.push({field:option, ...columnOptions[option].defaultFilter})
    }
  })
  return {items:defaultFilters}
}

export const bakeColumnDef = (statTypes, linkSources, tagTypes, users, existingTags) => {
  for (let typeIndex in statTypes) {
    const type = statTypes[typeIndex];
    const key = 'statistic.' + type['id']
    const sourceName = type['source'].charAt(0).toUpperCase() + type['source'].slice(1);
    const linkSource = linkSources.filter((s) => s.key === type['source']).pop()
    columnOptions[key] = {
      field: key,
      keyName: type['source'] + "." + type['key'],
      headerName:  sourceName +' ' + type['name'],
      statName: type['name'],
      statTypeId: type['id'],
      source: type['source'],
      description: sourceName +' ' + type['name'],
      renderHeader: (params) => (
          <Tooltip title={linkSource['display_name'] + ' ' + type['name']}>
            <Box flex align={'center'} flexWrap={"nowrap"}>
              {linkSource && linkSource['logo'] ? <Iconify sx={{display: 'inline-block'}} icon={linkSource['logo']}></Iconify> : null}
              <Text display={'inline-block'}>&nbsp;{type['name']}</Text>
            </Box>
          </Tooltip>
      ),
      isMetric: true
    }
  }
  columnOptions['users']['valueGetter'] = (data) => {
    if (users) {
      const artistUsers = data.row?.users
      const filtered = []
      for (const userIndex in artistUsers) {
        const artistUser = artistUsers[userIndex]
        if (artistUser.user_id in users) {
          artistUser.user = users[artistUser.user_id]
          if (artistUser.user && artistUser.user.id) {
            filtered.push(artistUser)
          }
        } else {
          artistUser.user = null
        }
      }
      return (filtered?.map((item) => {
        return {
          "created_at": item.created_at,
          "artist_id": item.artist_id,
          ...item.user
        }
      }) ?? [])
    } else {
      return []
    }
  }
  if (users) {
    columnOptions['users']['valueOptions'] = Object.values(users ?? {}).map((user) => {
      return {
        label: user.first_name + " " + user.last_name,
        value: user.id
      }
    })
  }

  for (let tagIndex in tagTypes) {
    const tagType = tagTypes[tagIndex];
    if (tagType['key'] !== 'user') {
      continue;
    }
    const key = 'tag_' + tagType['key']
    const valueOptions = []
    if (existingTags) {
      const filtered = existingTags.filter((tag) => {
        return tag.tag_type_id === tagType['id']
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
    columnOptions[key] = {
      field: key,
      keyName: key,
      type: 'singleSelect',
      headerName: tagType['name'] + 's',
      description:  tagType['name'] + 's',
      sortable: false,
      valueGetter: (data) => data.row?.tags.filter((tag) => tag.tag_type_id === tagType['id']) ?? [],
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

  for (let typeIndex in linkSources) {
    const type = linkSources[typeIndex];

    const key = 'link_' + type['key']
    columnOptions[key] = {
      field: key,
      keyName: key,
      social: type['social'],
      filterable: false,
      sortable: false,
      headerName: type['display_name'] + ' Link',
      description:  type['display_name'] + ' Link',
      valueOptions: [
        {value: 0, label: 'DIY'}, {value: 2, label: 'Major'}, {value: 1, label: 'Indie'}
      ],
      renderHeader: (params) => (
          <Tooltip title={type['display_name'] + ' Link'}>
            <Wrap align={'center'}>
              {type['logo'] ? <Iconify sx={{display: 'inline-block'}} icon={type['logo']}></Iconify> : null}
              Link
            </Wrap>
          </Tooltip>
      ),
      renderCell: (params) => ( <MUILink color='primary' href={params.value}>{type['display_name']} <Iconify icon="mdi:external-link" sx={{display:'inline-block'}} /></MUILink> ),
      isMetric: false
    }
  }
}