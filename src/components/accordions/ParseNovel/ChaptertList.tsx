import PathItem from '@components/PathItem';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Plugin } from '@typings/plugin';
import dayjs from 'dayjs';
import React from 'react';
import { TableComponents, TableVirtuoso } from 'react-virtuoso';

const VirtuosoTableComponents: TableComponents<Plugin.ChapterItem> = {
  Scroller: React.forwardRef<HTMLDivElement>((props, ref) => (
    <TableContainer component={Paper} {...props} ref={ref} />
  )),
  Table: props => (
    <Table
      {...props}
      sx={{ borderCollapse: 'separate', tableLayout: 'fixed' }}
    />
  ),
  // @ts-ignore
  TableHead,
  TableRow: ({ item: _item, ...props }) => <TableRow {...props} />,
  TableBody: React.forwardRef<HTMLTableSectionElement>((props, ref) => (
    <TableBody {...props} ref={ref} />
  )),
};

function fixedHeaderContent() {
  return (
    <TableRow sx={{ backgroundColor: 'background.paper' }}>
      <TableCell variant="head">Index</TableCell>
      <TableCell variant="head">Name</TableCell>
      <TableCell variant="head">Path</TableCell>
      <TableCell variant="head">Release Time</TableCell>
      <TableCell variant="head">Number</TableCell>
    </TableRow>
  );
}

function rowContent(_index: number, row: Plugin.ChapterItem) {
  return (
    <React.Fragment>
      <TableCell>{_index}</TableCell>
      <TableCell>{row.name}</TableCell>
      <TableCell>
        <PathItem path={row.path} />
      </TableCell>
      <TableCell>{dayjs(row.releaseTime).format('YYYY/MM/DD')}</TableCell>
      <TableCell>{row.chapterNumber}</TableCell>
    </React.Fragment>
  );
}
export default function ChapterList({
  chapters,
}: {
  chapters: Plugin.ChapterItem[];
}) {
  return (
    <Paper style={{ height: 400, width: '100%', textAlign: 'left' }}>
      <TableVirtuoso
        data={chapters}
        components={VirtuosoTableComponents}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={rowContent}
      />
    </Paper>
  );
}
