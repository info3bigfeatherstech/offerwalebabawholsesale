import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import wholesaleAxios from "../../../SERVICES/Wholesaleaxios";

export const patchProductInventory = createAsyncThunk(
  "inventoryStock/patch",
  async ({ slug, variants }, { rejectWithValue }) => {
    try {
      const res = await wholesaleAxios.patch(`/admin/products/${slug}/inventory`, {
        variants,
      });
      if (!res.data?.success) {
        return rejectWithValue(res.data?.message || "Failed to update inventory");
      }
      return res.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || err.message || "Failed to update inventory"
      );
    }
  }
);

const inventoryStockSlice = createSlice({
  name: "inventoryStock",
  initialState: {
    loading: false,
    error: null,
    successMessage: null,
  },
  reducers: {
    clearInventoryStockMessages(state) {
      state.error = null;
      state.successMessage = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(patchProductInventory.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.successMessage = null;
      })
      .addCase(patchProductInventory.fulfilled, (state) => {
        state.loading = false;
        state.successMessage = "Inventory updated successfully";
      })
      .addCase(patchProductInventory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Failed to update inventory";
      });
  },
});

export const { clearInventoryStockMessages } = inventoryStockSlice.actions;
export default inventoryStockSlice.reducer;
