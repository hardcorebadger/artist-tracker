# Jakes notes on how the data grid works

```
const rows = [
  { id: 1, col1: 'Hello', col2: 'World' },
  { id: 2, col1: 'DataGridPro', col2: 'is Awesome' },
  { id: 3, col1: 'MUI', col2: 'is Amazing' },
];

const columns = [
  { field: 'col1', headerName: 'Column 1' },
  { field: 'col2', headerName: 'Column 2' },
];
```
at the most basic level we have to end up with 2 objects
columns and rows
rows would be artists
columns are the currently seleted columns, in order we want them to show

columns need a `field` which corresponds to a key in the row
`headerName` is the display name of the column

rows have a bunch of fields that correspond to the column `field`
for more complex display of data, you can write custom FE code to display it (ie sparklines)

## Static columns

for basic columns like artist name or signed/unsigned its easy

1. all artists returned should have those fields
2. available columns list defines all those standard fields

## Dynamic fields (stats)

the issue with stats is theres 3-5 columns for each stat (latest, previous, WoW, MoM, trendline, etc)

The way we currently deal with this is by baking columns and rows based on the columns selection

```
rows = [...
{'monthly_listeners': [23,34,54,65,23,24,56], ...}
]

columnSelection = {
    'monthly_listeners' {
        'trendline': true,
        'latest': false,
        'WoW': true,
        ...
    }
}

bake(rows) = [
    ...
    'monthly_listeners_trendline': rows[monthly_listeners],
    'monthly_listeners_WoW' = (rows[monthly_listeners][0] - rows[monthly_listeners][1]) / rows[monthly_listeners][1],
]

bake(columns) = [
    'monthly_listeners_trendline',
    'monthly_listeners_WoW',
    ...
]
```

So basically we "flatten" the datastructure and bake the stats into specific rows
Then we feed that into the table, as far is MUI knows, we just always had these fields in our data

## What to do now

Now the data from BE will just include the specific stat-function we want
So when we get from BE we wont have to bake the rows
ie, we'll just get

```
rows = [
    ...
    'monthly_listeners_trendline': [23,34,54,65,23,24,56],
    'monthly_listeners_WoW' = -14.5,
]
```

Since we're baking the columsn to the DB

So heres what to do

# Implementing

I created a new grid called MuiDataGridServer, and hooked it into the page

it basically has a function it calls every time it needs to refresh data from the server
the function is paginated, and calls every time a page needs to load OR if columns / filters change

it sends a filter/sort/page object to the function, you call your endpoint, and return the data

basically, you just have to line up the column names in FE to what youre sending back
specifically for the stats, for instance rn one of the stat names it expects is

"stat_spotify__monthly_listeners_current__abs-latest"

so however your stats end up getting named, make sure the row is a flat 1-level data structure and adjust columnMetricFactory to your naming convention