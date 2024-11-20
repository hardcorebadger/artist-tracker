import NumberFilter from '@inovua/reactdatagrid-community/NumberFilter'
import SelectFilter from '@inovua/reactdatagrid-community/SelectFilter'

import {
  Badge,
  Button,
  Link
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
    valueGetter: (value, row) => row.evaluation?.distributor ?? 'N/A',
    headerName: 'Distributor',
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
    valueGetter: (value, row) => row.evaluation?.status === 0 ? 'Unsigned' :  row.evaluation?.status === 1 ? 'Signed' : 'Unknown' ,
    valueOptions: [
      {value: "Signed", label: 'Signed'}, {value: 'Unsigned', label: 'Unsigned'}, {value: 'Unknown', label: 'Unknown'}
    ],
    renderCell: (params) => (
      <Chip variant="outlined" size='small' color={params.value == "Signed" ? "error" : params.value == "Unsigned" ? "primary" : "warning"} label={params.value} />
    ),
    type: 'singleSelect',

  },
  "evaluation.distributor_type": {
    field: 'evaluation.distributor_type',
    type: 'singleSelect',
    headerName: 'Distributor Type',
    valueGetter: (value, row) => row.evaluation?.distributor_type === 0 ? "DIY" : row.evaluation?.distributor_type === 1 ? "Indie" : "Major",
    isMetric: false,
    valueOptions: [
      {value: "DIY", label: 'DIY'}, {value: "Major", label: 'Major'}, {value: "Indie", label: 'Indie'}
    ],
    renderCell: (params) => (
      <Chip variant="outlined" size='small' color={params.value == "Major" ? "error" : params.value == "Indie" ? "warning" : "primary"} label={params.value} />
    ),

  },
  "evaluation.back_catalog": {
    field: 'evaluation.back_catalog',
    headerName: 'Backcatalog Status',
    valueGetter: (value, row) => (row.evaluation?.status === 2 ? 'Dirty' : 'Clean'),
    renderCell: (params) => (
      <Chip variant="outlined" size='small' color={params.value == "Dirty" ? "warning" : "primary"} label={params.value} />
    ),
    isMetric: false,
    filterEditor: SelectFilter,
    valueOptions: [
       {value:'Clean', label: 'Clean'}, {value: 'Dirty', label: 'Dirty'}
    ],
    type: 'singleSelect',
  },
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
      filterEditor: NumberFilter,
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
      filterEditor: NumberFilter,
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
      filterEditor: NumberFilter,
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
      filterEditor: NumberFilter,
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
        // console.log(params)
        return (
        <div style={{width:"100%", paddingTop: "5px"}}>
        <Sparklines data={params.value} min={0} height={50} width={params.colDef.width}>
          <SparklinesLine color="#329795" />
        </Sparklines>
        </div>
      )},
    }
  }

}

export const buildColumnSelection = (columnOrder, withIndexes = false) => {
  let columnSelection = {}
  Object.keys(columnOptions).forEach(c => {
    let col = columnOptions[c]
    if (!col.isMetric) {
      const index = columnOrder.indexOf(c)
      columnSelection[c] =  withIndexes ? (index) : (index !== -1)
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