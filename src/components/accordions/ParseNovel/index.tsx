import {
  Box,
  Button,
  Divider,
  Pagination,
  Stack,
  TextField,
} from '@mui/material';
import React, { useState } from 'react';
import AccordionContainer from '../components/AccordionContainer';
import { Plugin } from '@typings/plugin';
import usePlugin from '@hooks/usePlugin';
import SourceNovelCard from './SourceNovelCard';
import ChapterList from './ChaptertList';

export default function ParseNovel() {
  const plugin = usePlugin();
  const [sourceNovel, setSouceNovel] = useState<
    Plugin.SourceNovel | undefined
  >();
  const [chapters, setChapters] = useState<Plugin.ChapterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [novelPath, setNovelPath] = useState('');
  const fetchNovel = () => {
    if (plugin) {
      setLoading(true);
      plugin
        .parseNovel(novelPath)
        .then(res => {
          setSouceNovel(res);
          setChapters(res.chapters || []);
        })
        .finally(() => setLoading(false));
    }
  };
  const fetchPage = (page: number) => {
    if (plugin && page) {
      setLoading(true);
      (plugin as Plugin.PagePlugin)
        .parsePage(novelPath, page.toString())
        .then(res => setChapters(res.chapters))
        .finally(() => setLoading(false));
    }
  };
  return (
    <AccordionContainer title="Parse Novel" loading={loading}>
      <Stack direction={'row'} spacing={2}>
        <TextField
          value={novelPath}
          onChange={e => setNovelPath(e.target.value)}
          size="small"
          label="Novel path"
        />
        <Button
          disabled={plugin === undefined}
          onClick={fetchNovel}
          variant="contained"
        >
          Fetch
        </Button>
      </Stack>
      {sourceNovel ? <SourceNovelCard sourceNovel={sourceNovel} /> : null}
      <Box sx={{ height: 20 }} />
      {chapters.length ? <ChapterList chapters={chapters} /> : null}
      <Box sx={{ height: 20 }} />
      {/* @ts-ignore */}
      {sourceNovel?.totalPages ? (
        <Pagination
          // @ts-ignore
          count={sourceNovel.totalPages}
          onChange={(e, page) => fetchPage(page)}
          variant="outlined"
        />
      ) : null}
    </AccordionContainer>
  );
}
