import { Box, Button, Stack, TextField } from '@mui/material';
import React, { useEffect, useState } from 'react';
import AccordionContainer from '../components/AccordionContainer';
import { Plugin } from '@typings/plugin';
import NovelItemCard from '../components/NovelItemCard';
import { useSelector } from 'react-redux';
import { AppState } from '@redux/store';
import { getPlugin } from '@provider/plugins';
import { Filters } from '@libs/filterInputs';

export default function SearchNovels() {
  const selectedPluginItem = useSelector(
    (state: AppState) => state.plugin.selected,
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [plugin, setPlugin] = useState<Plugin.PluginBase | undefined>();
  const [novels, setNovels] = useState<Plugin.NovelItem[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (selectedPluginItem) {
      setPlugin(getPlugin(selectedPluginItem.id));
    }
  }, [selectedPluginItem]);
  const fetchNovels = () => {
    if (plugin) {
      setLoading(true);
      plugin
        .searchNovels(searchTerm, page)
        .then(res => setNovels(res))
        .finally(() => setLoading(false));
    }
  };
  return (
    <AccordionContainer title="Search Novels" loading={loading}>
      <Stack direction={'row'} spacing={2}>
        <TextField
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          size="small"
          label="Search term"
        />
        <Button
          disabled={plugin === undefined}
          onClick={fetchNovels}
          variant="contained"
        >
          Fetch
        </Button>
        <Button disabled={plugin === undefined} variant="outlined">
          Next Page
        </Button>
      </Stack>
      <Box
        sx={{
          width: '100%',
          overflowX: 'auto',
        }}
      >
        <Stack sx={{ width: 'max-content' }} direction={'row'} spacing={2}>
          {novels.map((novel, index) => (
            <NovelItemCard key={'searchedNovelItem_' + index} item={novel} />
          ))}
        </Stack>
      </Box>
    </AccordionContainer>
  );
}
