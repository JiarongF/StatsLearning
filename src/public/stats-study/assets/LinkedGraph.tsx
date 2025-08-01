import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box,
  Button,
  Container,
  Grid,
  Group,
  Stack,
  TextInput,
  Title,
  Switch,
  Divider,
  ScrollArea,
} from "@mantine/core";
import { initializeTrrack, Registry } from "@trrack/core";
import Histogram from "./linkedgraph/Histogram";
import SummaryStats from "./linkedgraph/SummaryStats";
import SimpleDataList from "./linkedgraph/SimpleDataDisplay";
import type { StimulusParams } from "../../../store/types";

interface DataItem {
  id: number;
  value: number;
}

interface ProvenanceState {
  data: DataItem[];
  showDataPanel: boolean;
  inputValue: string;
  // New edit state tracking
  editingId: number | null;
  editValue: string | number;
}

export default function LinkedGraph({
  parameters,
  setAnswer,
  provenanceState,
}: StimulusParams<any, ProvenanceState>) {
  const { taskid } = parameters;

  // Initial dataset
  const initData: DataItem[] = [
    { id: 1, value: 6 },
    { id: 2, value: 5 },
    { id: 3, value: 7 },
    { id: 4, value: 8 },
    { id: 5, value: 4 },
    { id: 6, value: 6 },
    { id: 7, value: 5 },
    { id: 8, value: 3 },
    { id: 9, value: 7 },
    { id: 10, value: 2 },
    { id: 11, value: 8 },
    { id: 12, value: 6 },
    { id: 13, value: 4 },
    { id: 14, value: 5 },
    { id: 15, value: 7 },
    { id: 16, value: 4 },
    { id: 17, value: 6 },
    { id: 18, value: 9 },
    { id: 19, value: 3 },
    { id: 20, value: 6 },
  ];

  // React state
  const [data, setData] = useState<DataItem[]>(initData);
  const [newValue, setNewValue] = useState<string>("");
  const [showDataPanel, setShowDataPanel] = useState<boolean>(false);
  // New edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string | number>("");

  // Provenance registry & Trrack
  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();

    const addDataPoint = reg.register(
      "addDataPoint",
      (state, item: DataItem) => {
        state.data = [...(state.data || []), item];
        state.inputValue = "";
        return state;
      },
    );

    const updateDataPoint = reg.register(
      "updateDataPoint",
      (state, item: DataItem) => {
        state.data = (state.data || ([] as DataItem[])).map((d: DataItem) =>
          d.id === item.id ? { ...d, value: item.value } : d,
        );
        // Clear edit state after update
        state.editingId = null;
        state.editValue = "";
        return state;
      },
    );

    const deleteDataPoint = reg.register(
      "deleteDataPoint",
      (state, id: number) => {
        state.data = (state.data || ([] as DataItem[])).filter(
          (d: DataItem) => d.id !== id,
        );
        // Clear edit state if deleted item was being edited
        if (state.editingId === id) {
          state.editingId = null;
          state.editValue = "";
        }
        return state;
      },
    );

    const resetData = reg.register("resetData", (state, _: void) => {
      state.data = initData;
      state.inputValue = "";
      state.editingId = null;
      state.editValue = "";
      return state;
    });

    const toggleDataPanel = reg.register(
      "toggleDataPanel",
      (state, v: boolean) => {
        state.showDataPanel = v;
        return state;
      },
    );

    const updateInputValue = reg.register(
      "updateInputValue",
      (state, value: string) => {
        state.inputValue = value;
        return state;
      },
    );

    // New actions for edit tracking
    const startEdit = reg.register("startEdit", (state, item: DataItem) => {
      state.editingId = item.id;
      state.editValue = item.value;
      return state;
    });

    const updateEditValue = reg.register(
      "updateEditValue",
      (state, value: string | number) => {
        state.editValue = value;
        return state;
      },
    );

    const cancelEdit = reg.register("cancelEdit", (state, _: void) => {
      state.editingId = null;
      state.editValue = "";
      return state;
    });

    const trrackInst = initializeTrrack({
      registry: reg,
      initialState: {
        data: initData,
        showDataPanel: false,
        inputValue: "",
        editingId: null,
        editValue: "",
      },
    });

    return {
      actions: {
        addDataPoint,
        updateDataPoint,
        deleteDataPoint,
        resetData,
        toggleDataPanel,
        updateInputValue,
        startEdit,
        updateEditValue,
        cancelEdit,
      },
      trrack: trrackInst,
    };
  }, []);

  // Snapshot helper
  const updateAnswer = useCallback(() => {
    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {
        [taskid]: JSON.stringify({
          dataCount: data.length,
          showDataPanel,
          inputValue: newValue,
          editingId,
          editValue,
        }),
      },
    });
  }, [
    setAnswer,
    taskid,
    trrack,
    data,
    showDataPanel,
    newValue,
    editingId,
    editValue,
  ]);

  // Initial answer
  useEffect(() => {
    updateAnswer();
  }, []);

  // Replay sync
  useEffect(() => {
    if (provenanceState) {
      if (provenanceState.data) setData(provenanceState.data);
      if (provenanceState.showDataPanel !== undefined)
        setShowDataPanel(provenanceState.showDataPanel);
      if (provenanceState.inputValue !== undefined)
        setNewValue(provenanceState.inputValue);
      if (provenanceState.editingId !== undefined)
        setEditingId(provenanceState.editingId);
      if (provenanceState.editValue !== undefined)
        setEditValue(provenanceState.editValue);
      updateAnswer();
    }
  }, [provenanceState, updateAnswer]);

  // Domain for histogram
  const domainX: [number, number] = [
    Math.min(...data.map((d) => d.value)) - 1,
    Math.max(...data.map((d) => d.value)) + 1,
  ];

  // Handlers
  const handleAdd = () => {
    const v = parseFloat(newValue);
    if (!isNaN(v)) {
      const item: DataItem = {
        id: Math.max(0, ...data.map((d) => d.id)) + 1,
        value: v,
      };
      trrack.apply("Data Point Added", actions.addDataPoint(item));
      setData((prev) => [...prev, item]);
      setNewValue("");
      updateAnswer();
    }
  };

  const handleReset = () => {
    trrack.apply("Data Reset", actions.resetData(undefined));
    setData(initData);
    setNewValue("");
    setEditingId(null);
    setEditValue("");
    updateAnswer();
  };

  const handleToggleDataPanel = (checked: boolean) => {
    trrack.apply("Data Panel Toggled", actions.toggleDataPanel(checked));
    setShowDataPanel(checked);
    updateAnswer();
  };

  const handleInputChange = (value: string) => {
    trrack.apply("Input Value Changed", actions.updateInputValue(value));
    setNewValue(value);
    updateAnswer();
  };

  // New edit handlers
  const handleStartEdit = (item: DataItem) => {
    trrack.apply("Edit Started", actions.startEdit(item));
    setEditingId(item.id);
    setEditValue(item.value);
    updateAnswer();
  };

  const handleEditValueChange = (value: string | number) => {
    trrack.apply("Edit Value Changed", actions.updateEditValue(value));
    setEditValue(value);
    updateAnswer();
  };

  const handleSaveEdit = (id: number) => {
    if (editValue !== "" && !isNaN(Number(editValue))) {
      const updatedItem = { id, value: parseFloat(String(editValue)) };
      trrack.apply("Edit Saved", actions.updateDataPoint(updatedItem));
      setData(data.map((item) => (item.id === id ? updatedItem : item)));
      setEditingId(null);
      setEditValue("");
      updateAnswer();
    }
  };

  const handleCancelEdit = () => {
    trrack.apply("Edit Cancelled", actions.cancelEdit(undefined));
    setEditingId(null);
    setEditValue("");
    updateAnswer();
  };

  // Diff-based update for edits/deletes from SimpleDataList
  const handleUpdateData = (newData: DataItem[]) => {
    // Identify added items
    newData.forEach((item) => {
      if (!data.find((d) => d.id === item.id)) {
        trrack.apply("Data Point Added", actions.addDataPoint(item));
      }
    });
    // Identify updated items
    newData.forEach((item) => {
      const original = data.find((d) => d.id === item.id);
      if (original && original.value !== item.value) {
        trrack.apply("Data Point Updated", actions.updateDataPoint(item));
      }
    });
    // Identify deleted items
    data.forEach((item) => {
      if (!newData.find((d) => d.id === item.id)) {
        trrack.apply("Data Point Deleted", actions.deleteDataPoint(item.id));
      }
    });
    setData(newData);
    updateAnswer();
  };

  return (
    <Container fluid>
      <Title order={2} mb="md">
        Explore Basic Statistics
      </Title>

      <Group align="flex-end" gap="md" mb="sm">
        <TextInput
          label="Add a value"
          value={newValue}
          onChange={(e) => handleInputChange(e.currentTarget.value)}
          type="number"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd}>Add</Button>
        <Button variant="outline" color="red" onClick={handleReset}>
          Reset Data
        </Button>
        <Switch
          label="Show Data Panel"
          checked={showDataPanel}
          onChange={(e) => handleToggleDataPanel(e.currentTarget.checked)}
        />
      </Group>

      <Divider my="sm" />

      <Grid gutter="md" grow>
        {showDataPanel && (
          <Grid.Col span={4}>
            <ScrollArea mah={300} offsetScrollbars>
              <SimpleDataList
                data={data}
                setData={handleUpdateData}
                editingId={editingId}
                editValue={editValue}
                onStartEdit={handleStartEdit}
                onEditValueChange={handleEditValueChange}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
              />
            </ScrollArea>
          </Grid.Col>
        )}

        <Grid.Col span={showDataPanel ? 8 : 12}>
          <Stack style={{ height: 800 }} gap="md">
            <Box style={{ maxWidth: 350 }}>
              <SummaryStats data={data} />
            </Box>
            <Box style={{ flexGrow: 1 }}>
              <Histogram data={data} />
            </Box>
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
