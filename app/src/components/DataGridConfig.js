// import NumberFilter from '@inovua/reactdatagrid-community/NumberFilter'
// import SelectFilter from '@inovua/reactdatagrid-community/SelectFilter'

import {
  Badge,
  Button,
  Link, Wrap
} from '@chakra-ui/react';
import Iconify from '../components/Iconify';
// import Chart from "react-apexcharts";
import numeral from 'numeral'
import { Sparklines, SparklinesLine } from 'react-sparklines';
import {useState} from "react";
import {httpsCallable} from "firebase/functions";
import {functions} from "../firebase";
import {Chip} from '@mui/material';

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

export const defaultColumnOrder = ['link_spotify', 'evaluation.status', 'evaluation.distributor', 'evaluation.back_catalog', 'statistic.30-latest']

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
    renderCell: (params) => (
      <Chip variant="outlined" size='small' color={params.value == 1 ? "error" : params.value == 0 ? "primary" : "warning"} label={params.value == 0 ? 'Unsigned' : (params.value == 1 ? 'Signed' : 'Unknown')} />
    ),
    type: 'singleSelect',

  },
  "evaluation.distributor_type": {
    field: 'evaluation.distributor_type',
    type: 'singleSelect',
    headerName: 'Distributor Type',
    valueGetter: (data) => data.row?.evaluation?.distributor_type === 0 ? "DIY" : data.row?.evaluation?.distributor_type === 1 ? "Indie" : "Major",
    isMetric: false,
    valueOptions: [
      {value: 0, label: 'DIY'}, {value: 2, label: 'Major'}, {value: 1, label: 'Indie'}
    ],
    renderCell: (params) => {
      return (
      <Chip variant="outlined" size='small'
            color={params.value == "Major" ? "error" : params.value == "Indie" ? "warning" : "primary"}
            label={params.value}/>

      )
    },

  },
  "evaluation.back_catalog": {
    field: 'evaluation.back_catalog',
    headerName: 'Backcatalog Status',
    valueGetter: (data) => (data.row?.evaluation?.back_catalog ?? null),
    renderCell: (params) => (
      <Chip variant="outlined" size='small' color={params.value == 1 ? "warning" : "primary"} label={(params.value == null ? 'Unknown' : (params.value == 0 ? 'Clean' : 'Dirty'))} />
    ),
    isMetric: false,
    // filterEditor: SelectFilter,
    valueOptions: [
       {value: 0, label: 'Clean'}, {value: 1, label: 'Dirty'}
    ],
    type: 'singleSelect',
  },
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
      renderCell: (params) => <span>{numeral(params.value).format('0.0 a')}</span>
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
      renderCell: (params) => row => <span>{numeral(params.value).format('0.0a')}</span>
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
      renderCell: (params) => <span>{numeral(params.value).format('0.00%')}</span>
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
      renderCell: (params) => <span>{numeral(params.value).format('0.00%')}</span>
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