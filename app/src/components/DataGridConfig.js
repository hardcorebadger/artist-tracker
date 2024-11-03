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

export const defaultColumnOrder = ['spotify_url', 'eval_status', 'eval_distro', 'stat_spotify__monthly_listeners_current__abs-latest']

export const columnOptions = {
  "eval_distro": {
    field: 'eval_distro',
    headerName: 'Distributor',
    isMetric: false,
    defaultFilter: {
      type: 'string',
      operator: 'startsWith',
      value: ''
    }
  },
  "eval_status": {
    field: 'eval_status',
    headerName: 'Status',
    isMetric: false,
    filterEditor: SelectFilter,
    filterEditorProps: {
      placeholder: 'All',
      dataSource: [{id:'signed', label: 'Signed'}, {id:'unsigned', label: 'Unsigned'}]
    },
    render: row => <Badge colorScheme={row.value == 'signed' ? 'red' : 'green'}>{row.value}</Badge>,
    defaultFilter: {
      type: 'string',
      operator: 'startsWith',
      value: ''
    }
  },
  "eval_distro_type": {
    field: 'eval_distro_type',
    headerName: 'Distribution Type',
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
  "eval_prios": {
    field: 'eval_prios',
    headerName: 'Backcatalog Status',
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
  "spotify_url": {
    field: 'spotify_url',
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
  "stat_spotify__monthly_listeners_current__abs": {
    field: 'stat_spotify__monthly_listeners_current__abs',
    headerName: 'Spotify Monthly Listeners',
    isMetric: true
  },
  "stat_deezer__followers_total__abs": {
    field: 'stat_deezer__followers_total__abs',
    headerName: 'Deezer Followers',
    isMetric: true
  },
  "stat_tiktok__followers_total__abs": {
    field: 'stat_tiktok__followers_total__abs',
    headerName: 'Tiktok Followers',
    isMetric: true
  },
  "stat_youtube__subscribers_total__abs": {
    field: 'stat_youtube__subscribers_total__abs',
    headerName: 'Youtube Subscribers',
    isMetric: true
  },
  "stat_soundcloud__followers_total__abs": {
    field: 'stat_soundcloud__followers_total__abs',
    headerName: 'Souncloud Followers',
    isMetric: true
  },
  "stat_instagram__followers_total__abs": {
    field: 'stat_instagram__followers_total__abs',
    headerfield: 'Instagram Followers',
    isMetric: true
  }
}

export const metricFunctions = {
  "latest": {
    field: 'latest',
    headerName: "Latest",
    op: input => input && input.length > 0 ? input[input.length-1] : 0,
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
    op: input => input && input.length > 1 ? input[input.length-2] : 0,
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
  "wow": {
    field: 'wow',
    headerName: "Week / Week",
    op: input => input && input.length > 1 ? (input[input.length-1] - input[input.length-2]) / input[input.length-2] : 0,
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
  "mom": {
    field: 'mom',
    headerName: "Month / Month",
    op: input => input && input.length > 3 ? (input[input.length-1] - input[input.length-5]) / input[input.length-5] : 0,
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
  "series": {
    field: 'series',
    headerName: "Trendline",
    op: input => input ? input : [],
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
        // c = stat_instagram__followers_total__abs
        // m = latest
        // let orderKey = c + "-" + m
        // let selected = columnOrder.includes(c + "-" + m)
        columnSelection[c][m] = columnOrder.includes(c + "-" + m)
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