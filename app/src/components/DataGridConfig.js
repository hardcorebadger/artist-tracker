import NumberFilter from '@inovua/reactdatagrid-community/NumberFilter'
import SelectFilter from '@inovua/reactdatagrid-community/SelectFilter'

import {
  Badge,
  Link
} from '@chakra-ui/react';
import Iconify from '../components/Iconify';
// import Chart from "react-apexcharts";
import numeral from 'numeral'
import { Sparklines, SparklinesLine } from 'react-sparklines';
import {useState} from "react";
import {httpsCallable} from "firebase/functions";
import {functions} from "../firebase";


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
    defaultFilter: {
      type: 'string',
      operator: 'startsWith',
      value: ''
    }
  },
  "evaluation.status": {
    field: 'evaluation.status',
    headerName: 'Status',
    valueGetter: (value, row) =>  (row.evaluation ? (row.evaluation?.status === 0 ? 'unsigned' : 'signed') : 'unknown'),
    isMetric: false,
    filterEditor: SelectFilter,
    filterEditorProps: {
      placeholder: 'All',
      dataSource: [{id:'signed', label: 'Signed'}, {id:'unsigned', label: 'Unsigned'}]
    },
    render: row => <Badge colorScheme={row.value === 'signed' ? 'red' : 'green'}>{row.value}</Badge>,
    defaultFilter: {
      type: 'string',
      operator: 'startsWith',
      value: ''
    }
  },
  "evaluation.distributor_type": {
    field: 'evaluation.distributor_type',
    headerName: 'Distributor Type',
    valueGetter: (value, row) => row.evaluation?.distributor_type === 1 ? 'indie' : (row.evaluation?.distributor_type === 2) ? 'major' : ('diy'),
    isMetric: false,
    filterEditor: SelectFilter,
    render: row => <Badge colorScheme={row.value == 'diy' ? 'green' : row.value == 'indie' ? 'yellow' : 'red'}>{row.value}</Badge>,
    filterEditorProps: {
      placeholder: 'All',
      dataSource: [{id:'diy', label: 'diy'}, {id:'major', label: 'major'}, {id:'indie', label: 'indie'}]
    },
    defaultFilter: {
      type: 'string',
      operator: 'startsWith',
      value: ''
    }
  },
  "evaluation.back_catalog": {
    field: 'evaluation.back_catalog',
    headerName: 'Backcatalog Status',
    valueGetter: (value, row) => (row.evaluation?.status === 2 ? 'dirty' : 'clean'),
    isMetric: false,
    filterEditor: SelectFilter,
    render: row => <Badge colorScheme={row.value == 'clean' ? 'green' : 'red'}>{row.value}</Badge>,
    filterEditorProps: {
      placeholder: 'All',
      dataSource: [{id:'clean', label: 'clean'}, {id:'dirty', label: 'dirty'}]
    },
    defaultFilter: {
      type: 'string',
      operator: 'startsWith',
      value: ''
    }
  },
  "link_spotify": {
    field: 'link_spotify',
    headerName: 'Spotify URL',
    render: row => <Link color='primary.500' href={row.value} isExternal>Spotify <Iconify icon="mdi:external-link" sx={{display:'inline-block'}} /></Link>,
    isMetric: false
  },
  "genres": {
    field: 'genres',
    op: input => input.length > 0 ? input[0] : "",
    headerName: 'Genre',
    isMetric: false,
    defaultFilter: {
      type: 'string',
      operator: 'startsWith',
      value: ''
    }
  },
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
      render: row => <span>{numeral(row.value).format('0.0a')}</span>
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
      render: row => <span>{numeral(row.value).format('0.0a')}</span>
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
      render: row => <span>{numeral(row.value).format('0.00%')}</span>
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
      render: row => <span>{numeral(row.value).format('0.00%')}</span>
    }
  },
  "data": {
    field: 'data',
    headerName: "Trendline",
    options: {
      type: 'number',
      sortable: false,
      render: row => {
        return (
        <Sparklines data={row.value} min={0}>
          <SparklinesLine color="#329795" />
        </Sparklines>
        )
      }
    }
  }

}

export const buildColumnSelection = (columnOrder) => {
  let columnSelection = {}
  Object.keys(columnOptions).forEach(c => {
    let col = columnOptions[c]
    if (!col.isMetric) {
      columnSelection[c] = columnOrder.includes(c)
    } else {
      columnSelection[c] = {}
      Object.keys(metricFunctions).forEach(m => {
        // c = stat_instagram__followers_total
        // m = latest
        // let orderKey = c + "-" + m
        // let selected = columnOrder.includes(c + "-" + m)
        columnSelection[c][m] = columnOrder.includes('statistic.'+columnOptions[c]['statTypeId'] + "-" + m)
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
  return defaultFilters
}