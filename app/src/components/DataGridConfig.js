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

export const defaultColumnSelection = {
  "distro": true,
  "status": true,
  "distro_type": true,
  "spotify_url": true,
  "global_streams": {
    "latest": true,
    "previous": false,
    "wow": false,
    "mom": false,
    "series": true
  },
  "spotify_streams": {
    "latest": false,
    "previous": false,
    "wow": false,
    "mom": false,
    "series": false
  },
}

export const defaultColumnOrder = ['name', 'spotify_url', 'global_streams-series', 'status', 'distro', 'global_streams-latest']

export const columnOptions = {
  "distro": {
    name: 'distro',
    header: 'Distributor',
    isMetric: false,
    defaultFilter: {
      type: 'string',
      operator: 'startsWith',
      value: ''
    }
  },
  "status": {
    name: 'status',
    header: 'Status',
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
  "distro_type": {
    name: 'distro_type',
    header: 'Distribution Type',
    isMetric: false,
    filterEditor: SelectFilter,
    render: row => <Badge colorScheme={row.value == 'DIY' ? 'green' : row.value == 'Indie' ? 'yellow' : 'red'}>{row.value}</Badge>,
    filterEditorProps: {
      placeholder: 'All',
      dataSource: [{id:'DIY', label: 'DIY'}, {id:'Major', label: 'Major'}, {id:'Indie', label: 'Indie'}]
    },
    defaultFilter: {
      type: 'string',
      operator: 'startsWith',
      value: ''
    }
  },
  "spotify_url": {
    name: 'spotify_url',
    header: 'Spotify URL',
    render: row => <Link color='primary.500' href={row.value} isExternal>Spotify <Iconify icon="mdi:external-link" sx={{display:'inline-block'}} /></Link>,
    isMetric: false
  },
  "global_streams": {
    name: 'global_streams',
    header: 'Streams',
    isMetric: true
  },
  "spotify_streams": {
    name: 'spotify_streams',
    header: 'Spotify Streams',
    isMetric: true
  }
}

export const metricFunctions = {
  "latest": {
    name: 'latest',
    header: "Latest",
    op: input => input[0],
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
    name: 'previous',
    header: "Previous",
    op: input => input[1],
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
    name: 'wow',
    header: "Week / Week",
    op: input => (input[0] - input[1]) / input[1],
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
    name: 'mom',
    header: "Month / Month",
    op: input => (input[0] - input[4]) / input[4],
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
    name: 'series',
    header: "Trendline",
    op: input => input.slice().reverse(),
    options: {
      type: 'number',
      sortable: false,
      render: row => {
        return <Sparklines data={row.value} >
          <SparklinesLine color="#329795" />
        </Sparklines>
        // return <Chart
        //   options={miniBarChartOptions}
        //   series={[{
        //     name: "Streams",
        //     data: row.value
        //   }]}
        //   type="line"
        //   width="60"
        // />
      }
    }
  }

}

export const buildDefaultFilters = () => {
  let defaultFilters = []
  Object.keys(columnOptions).forEach(option => {
    if (columnOptions[option].isMetric) {
      Object.keys(metricFunctions).forEach(func => {
        if ('defaultFilter' in metricFunctions[func])
          defaultFilters.push({name:option+"-"+func, ...metricFunctions[func].defaultFilter})
      })
    } else {
      if ('defaultFilter' in columnOptions[option])
        defaultFilters.push({name:option, ...columnOptions[option].defaultFilter})
    }
  })
  return defaultFilters
}