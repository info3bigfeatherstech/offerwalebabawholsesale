// ADMIN_REDUX_MANAGEMENT/categoriesSlice.js
// COMPLETE FILE - Replace your existing file with this

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
// import axiosInstance from "../../../SERVICES/wholesaleAxios";
import wholesaleAxios from "../../../SERVICES/Wholesaleaxios"; // adjust path

// ─────────────────────────────────────────────────────────────
//  ASYNC THUNKS
// ─────────────────────────────────────────────────────────────

// 1. Fetch all categories (public endpoint)
export const fetchCategories = createAsyncThunk(
  "categories/fetchAll",
  async (_, { rejectWithValue }) => {
    try {
      const res = await wholesaleAxios.get("/categories/admin/categories");
      const cats = res.data.categories;
      return Array.isArray(cats) ? cats : [];
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to fetch categories"
      );
    }
  }
);

// 2. Create category (admin)
export const createCategory = createAsyncThunk(
  "categories/create",
  async (categoryData, { rejectWithValue }) => {
    try {
      const fd = new FormData();
      fd.append("name", categoryData.name);
      if (categoryData.description) fd.append("description", categoryData.description);
      if (categoryData.parent) fd.append("parent", categoryData.parent);
      if (categoryData.status) fd.append("status", categoryData.status);
      if (categoryData.imageFile instanceof File)
        fd.append("image", categoryData.imageFile);
      if (categoryData.cardImageFile instanceof File)
        fd.append("cardImage", categoryData.cardImageFile);

      const res = await wholesaleAxios.post("/categories/admin/categories", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.category || res.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to create category"
      );
    }
  }
);

// 3. Update category (admin)
export const updateCategory = createAsyncThunk(
  "categories/update",
  async ({ id, categoryData }, { rejectWithValue }) => {
    try {
      const fd = new FormData();
      if (categoryData.name) fd.append("name", categoryData.name);
      if (categoryData.description !== undefined)
        fd.append("description", categoryData.description);
      if (categoryData.status) fd.append("status", categoryData.status);
      if (categoryData.order !== undefined)
        fd.append("order", categoryData.order);
      if (categoryData.imageFile instanceof File)
        fd.append("image", categoryData.imageFile);
      if (categoryData.cardImageFile instanceof File)
        fd.append("cardImage", categoryData.cardImageFile);
      if (categoryData.removeImage) fd.append("removeImage", "true");
      if (categoryData.removeCardImage) fd.append("removeCardImage", "true");

      const res = await wholesaleAxios.put(`/categories/admin/categories/${id}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.category || res.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to update category"
      );
    }
  }
);

// 4. Delete category (admin) — soft delete
export const deleteCategory = createAsyncThunk(
  "categories/delete",
  async (id, { rejectWithValue }) => {
    try {
      await wholesaleAxios.delete(`/categories/admin/categories/${id}`);
      return id;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to delete category"
      );
    }
  }
);

// 5. Reorder categories (bulk update) - NEW
export const reorderCategories = createAsyncThunk(
  "categories/reorder",
  async (orderedCategories, { rejectWithValue }) => {
    try {
      const payload = {
        categories: orderedCategories.map((cat, index) => ({
          id: cat._id,
          order: index
        }))
      };
      
      const res = await wholesaleAxios.post("/categories/admin/categories/reorder", payload);
      return res.data.categories || orderedCategories;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to reorder categories"
      );
    }
  }
);

// 6. Toggle category visibility (hide/unhide) - NEW
export const toggleCategoryVisibility = createAsyncThunk(
  "categories/toggleVisibility",
  async ({ id, isHidden }, { rejectWithValue }) => {
    try {
      const res = await wholesaleAxios.patch(`/categories/admin/categories/${id}/toggle-visibility`, { isHidden });
      return res.data.category;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to toggle category visibility"
      );
    }
  }
);

// ─────────────────────────────────────────────────────────────
//  SLICE
// ─────────────────────────────────────────────────────────────
const categoriesSlice = createSlice({
  name: "categories",
  initialState: {
    categories: [],
    loading: false,
    loaded: false,
    error: null,

    createLoading: false,
    createError: null,

    updateLoading: false,
    updateError: null,

    deleteLoading: false,
    deleteError: null,

    reorderLoading: false,    // NEW
    reorderError: null,       // NEW
    
    toggleLoading: false,     // NEW
    toggleError: null,        // NEW
  },
  reducers: {
    clearCategoryErrors(state) {
      state.error = null;
      state.createError = null;
      state.updateError = null;
      state.deleteError = null;
      state.reorderError = null;
      state.toggleError = null;
    },
    // For optimistic updates in the modal
    updateLocalCategoryOrder(state, action) {
      state.categories = action.payload;
    },
    updateLocalCategoryVisibility(state, action) {
      const { id, isHidden } = action.payload;
      const category = state.categories.find(c => c._id === id);
      if (category) {
        category.status = isHidden ? 'inactive' : 'active';
        category.isHidden = isHidden;
      }
    }
  },
  extraReducers: (builder) => {
    // ── fetchCategories ───────────────────────────────────────
    builder
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.categories = action.payload;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

   

    // ── createCategory ────────────────────────────────────────
    builder
      .addCase(createCategory.pending, (state) => {
        state.createLoading = true;
        state.createError = null;
      })
      .addCase(createCategory.fulfilled, (state, action) => {
        state.createLoading = false;
        state.categories = [...state.categories, action.payload];
      })
      .addCase(createCategory.rejected, (state, action) => {
        state.createLoading = false;
        state.createError = action.payload;
      });

    // ── updateCategory ────────────────────────────────────────
    builder
      .addCase(updateCategory.pending, (state) => {
        state.updateLoading = true;
        state.updateError = null;
      })
      .addCase(updateCategory.fulfilled, (state, action) => {
        state.updateLoading = false;
        const updated = action.payload;
        state.categories = state.categories.map((c) =>
          c._id === updated._id ? updated : c
        );
      })
      .addCase(updateCategory.rejected, (state, action) => {
        state.updateLoading = false;
        state.updateError = action.payload;
      });

    // ── deleteCategory ────────────────────────────────────────
    builder
      .addCase(deleteCategory.pending, (state) => {
        state.deleteLoading = true;
        state.deleteError = null;
      })
      .addCase(deleteCategory.fulfilled, (state, action) => {
        state.deleteLoading = false;
        state.categories = state.categories.filter(
          (c) => c._id !== action.payload
        );
      })
      .addCase(deleteCategory.rejected, (state, action) => {
        state.deleteLoading = false;
        state.deleteError = action.payload;
      });

    // ── reorderCategories (NEW) ───────────────────────────────
    builder
      .addCase(reorderCategories.pending, (state) => {
        state.reorderLoading = true;
        state.reorderError = null;
      })
      .addCase(reorderCategories.fulfilled, (state, action) => {
        state.reorderLoading = false;
        state.categories = action.payload;
      })
      .addCase(reorderCategories.rejected, (state, action) => {
        state.reorderLoading = false;
        state.reorderError = action.payload;
      });

    // ── toggleCategoryVisibility (NEW) ────────────────────────
    builder
      .addCase(toggleCategoryVisibility.pending, (state) => {
        state.toggleLoading = true;
        state.toggleError = null;
      })
      .addCase(toggleCategoryVisibility.fulfilled, (state, action) => {
        state.toggleLoading = false;
        const updated = action.payload;
        state.categories = state.categories.map((c) =>
          c._id === updated._id ? updated : c
        );
      })
      .addCase(toggleCategoryVisibility.rejected, (state, action) => {
        state.toggleLoading = false;
        state.toggleError = action.payload;
      });
  },
});

export const { 
  clearCategoryErrors, 
  updateLocalCategoryOrder, 
  updateLocalCategoryVisibility 
} = categoriesSlice.actions;

export default categoriesSlice.reducer;
// code is wokking but upper code have drag and manupulate
// // ADMIN_REDUX_MANAGEMENT/categoriesSlice.js

// import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
// import wholesaleAxios from "../../../SERVICES/axiosInstance";

// // ─────────────────────────────────────────────────────────────
// //  ASYNC THUNKS
// // ─────────────────────────────────────────────────────────────

// // 1. Fetch all categories (public endpoint)
// export const fetchCategories = createAsyncThunk(
//   "categories/fetchAll",
//   async (_, { rejectWithValue }) => {
//     try {
//       const res = await axiosInstance.get("/categories/categories");
//       // backend returns { success, categories } or array directly
//       return res.data.categories || res.data.data || res.data || [];
//     } catch (err) {
//       return rejectWithValue(
//         err.response?.data?.message || "Failed to fetch categories"
//       );
//     }
//   }
// );

// // 2. Create category (admin) — supports optional image upload
// export const createCategory = createAsyncThunk(
//   "categories/create",
//   async (categoryData, { rejectWithValue }) => {
//     try {
//       // categoryData = { name, description?, parent?, status?, showInMenu?, imageFile? }
//       const fd = new FormData();
//       fd.append("name", categoryData.name);
//       if (categoryData.description) fd.append("description", categoryData.description);
//       if (categoryData.parent) fd.append("parent", categoryData.parent);
//       if (categoryData.status) fd.append("status", categoryData.status);
//       if (categoryData.showInMenu !== undefined)
//         fd.append("showInMenu", categoryData.showInMenu.toString());
//       if (categoryData.imageFile instanceof File)
//         fd.append("image", categoryData.imageFile);

//       const res = await axiosInstance.post("/categories/admin/categories", fd, {
//         headers: { "Content-Type": "multipart/form-data" },
//       });
//       return res.data.category || res.data;
//     } catch (err) {
//       return rejectWithValue(
//         err.response?.data?.message || "Failed to create category"
//       );
//     }
//   }
// );

// // 3. Update category (admin)
// export const updateCategory = createAsyncThunk(
//   "categories/update",
//   async ({ id, categoryData }, { rejectWithValue }) => {
//     try {
//       const fd = new FormData();
//       if (categoryData.name) fd.append("name", categoryData.name);
//       if (categoryData.description !== undefined)
//         fd.append("description", categoryData.description);
//       if (categoryData.status) fd.append("status", categoryData.status);
//       if (categoryData.imageFile instanceof File)
//         fd.append("image", categoryData.imageFile);

//       const res = await axiosInstance.put(`/categories/admin/categories/${id}`, fd, {
//         headers: { "Content-Type": "multipart/form-data" },
//       });
//       return res.data.category || res.data;
//     } catch (err) {
//       return rejectWithValue(
//         err.response?.data?.message || "Failed to update category"
//       );
//     }
//   }
// );

// // 4. Delete category (admin) — soft delete
// export const deleteCategory = createAsyncThunk(
//   "categories/delete",
//   async (id, { rejectWithValue }) => {
//     try {
//       await axiosInstance.delete(`/categories/admin/categories/${id}`);
//       return id;
//     } catch (err) {
//       return rejectWithValue(
//         err.response?.data?.message || "Failed to delete category"
//       );
//     }
//   }
// );

// // ─────────────────────────────────────────────────────────────
// //  SLICE
// // ─────────────────────────────────────────────────────────────
// const categoriesSlice = createSlice({
//   name: "categories",
//   initialState: {
//     categories: [],
//     loading: false,
//     loaded: false,
//     error: null,

//     createLoading: false,
//     createError: null,

//     updateLoading: false,
//     updateError: null,

//     deleteLoading: false,
//     deleteError: null,
//   },
//   reducers: {
//     clearCategoryErrors(state) {
//       state.error = null;
//       state.createError = null;
//       state.updateError = null;
//       state.deleteError = null;
//     },
//   },
//   extraReducers: (builder) => {
//     // ── fetchCategories ───────────────────────────────────────
//     builder
//       .addCase(fetchCategories.pending, (state) => {
//         state.loading = true;
//         state.error = null;
//       })
//       .addCase(fetchCategories.fulfilled, (state, action) => {
//         state.loading = false;
//         state.loaded = true;
//         state.categories = action.payload;
//       })
//       .addCase(fetchCategories.rejected, (state, action) => {
//         state.loading = false;
//         state.error = action.payload;
//       });

//     // ── createCategory ────────────────────────────────────────
//     builder
//       .addCase(createCategory.pending, (state) => {
//         state.createLoading = true;
//         state.createError = null;
//       })
//       .addCase(createCategory.fulfilled, (state, action) => {
//         state.createLoading = false;
//         state.categories = [...state.categories, action.payload];
//       })
//       .addCase(createCategory.rejected, (state, action) => {
//         state.createLoading = false;
//         state.createError = action.payload;
//       });

//     // ── updateCategory ────────────────────────────────────────
//     builder
//       .addCase(updateCategory.pending, (state) => {
//         state.updateLoading = true;
//         state.updateError = null;
//       })
//       .addCase(updateCategory.fulfilled, (state, action) => {
//         state.updateLoading = false;
//         const updated = action.payload;
//         state.categories = state.categories.map((c) =>
//           c._id === updated._id ? updated : c
//         );
//       })
//       .addCase(updateCategory.rejected, (state, action) => {
//         state.updateLoading = false;
//         state.updateError = action.payload;
//       });

//     // ── deleteCategory ────────────────────────────────────────
//     builder
//       .addCase(deleteCategory.pending, (state) => {
//         state.deleteLoading = true;
//         state.deleteError = null;
//       })
//       .addCase(deleteCategory.fulfilled, (state, action) => {
//         state.deleteLoading = false;
//         // Soft delete — set status inactive or remove from list
//         state.categories = state.categories.filter(
//           (c) => c._id !== action.payload
//         );
//       })
//       .addCase(deleteCategory.rejected, (state, action) => {
//         state.deleteLoading = false;
//         state.deleteError = action.payload;
//       });
//   },
// });

// export const { clearCategoryErrors } = categoriesSlice.actions;
// export default categoriesSlice.reducer;

// // ADMIN_REDUX_MANAGEMENT/categoriesSlice.js

// import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
// import axiosInstance from "../../../SERVICES/axiosInstance"; // adjust path

// // ─────────────────────────────────────────────────────────────
// //  ASYNC THUNKS
// // ─────────────────────────────────────────────────────────────

// // 1. Fetch all categories (public endpoint)
// export const fetchCategories = createAsyncThunk(
//   "categories/fetchAll",
//   async (_, { rejectWithValue }) => {
//     try {
//       const res = await axiosInstance.get("/categories/categories");
//       // backend returns { success, categories } or array directly
//       return res.data.categories || res.data.data || res.data || [];
//     } catch (err) {
//       return rejectWithValue(
//         err.response?.data?.message || "Failed to fetch categories"
//       );
//     }
//   }
// );

// // 2. Create category (admin) — supports optional image upload
// export const createCategory = createAsyncThunk(
//   "categories/create",
//   async (categoryData, { rejectWithValue }) => {
//     try {
//       // categoryData = { name, description?, parent?, status?, showInMenu?, imageFile? }
//       const fd = new FormData();
//       fd.append("name", categoryData.name);
//       if (categoryData.description) fd.append("description", categoryData.description);
//       if (categoryData.parent) fd.append("parent", categoryData.parent);
//       if (categoryData.status) fd.append("status", categoryData.status);
//       if (categoryData.showInMenu !== undefined)
//         fd.append("showInMenu", categoryData.showInMenu.toString());
//       if (categoryData.imageFile instanceof File)
//         fd.append("image", categoryData.imageFile);

//       const res = await axiosInstance.post("/categories/admin/categories", fd, {
//         headers: { "Content-Type": "multipart/form-data" },
//       });
//       return res.data.category || res.data;
//     } catch (err) {
//       return rejectWithValue(
//         err.response?.data?.message || "Failed to create category"
//       );
//     }
//   }
// );

// // 3. Update category (admin)
// export const updateCategory = createAsyncThunk(
//   "categories/update",
//   async ({ id, categoryData }, { rejectWithValue }) => {
//     try {
//       const fd = new FormData();
//       if (categoryData.name) fd.append("name", categoryData.name);
//       if (categoryData.description !== undefined)
//         fd.append("description", categoryData.description);
//       if (categoryData.status) fd.append("status", categoryData.status);
//       if (categoryData.imageFile instanceof File)
//         fd.append("image", categoryData.imageFile);

//       const res = await axiosInstance.put(`/categories/admin/categories/${id}`, fd, {
//         headers: { "Content-Type": "multipart/form-data" },
//       });
//       return res.data.category || res.data;
//     } catch (err) {
//       return rejectWithValue(
//         err.response?.data?.message || "Failed to update category"
//       );
//     }
//   }
// );

// // 4. Delete category (admin) — soft delete
// export const deleteCategory = createAsyncThunk(
//   "categories/delete",
//   async (id, { rejectWithValue }) => {
//     try {
//       await axiosInstance.delete(`/categories/admin/categories/${id}`);
//       return id;
//     } catch (err) {
//       return rejectWithValue(
//         err.response?.data?.message || "Failed to delete category"
//       );
//     }
//   }
// );

// // ─────────────────────────────────────────────────────────────
// //  SLICE
// // ─────────────────────────────────────────────────────────────
// const categoriesSlice = createSlice({
//   name: "categories",
//   initialState: {
//     categories: [],
//     loading: false,
//     loaded: false,
//     error: null,

//     createLoading: false,
//     createError: null,

//     updateLoading: false,
//     updateError: null,

//     deleteLoading: false,
//     deleteError: null,
//   },
//   reducers: {
//     clearCategoryErrors(state) {
//       state.error = null;
//       state.createError = null;
//       state.updateError = null;
//       state.deleteError = null;
//     },
//   },
//   extraReducers: (builder) => {
//     // ── fetchCategories ───────────────────────────────────────
//     builder
//       .addCase(fetchCategories.pending, (state) => {
//         state.loading = true;
//         state.error = null;
//       })
//       .addCase(fetchCategories.fulfilled, (state, action) => {
//         state.loading = false;
//         state.loaded = true;
//         state.categories = action.payload;
//       })
//       .addCase(fetchCategories.rejected, (state, action) => {
//         state.loading = false;
//         state.error = action.payload;
//       });

//     // ── createCategory ────────────────────────────────────────
//     builder
//       .addCase(createCategory.pending, (state) => {
//         state.createLoading = true;
//         state.createError = null;
//       })
//       .addCase(createCategory.fulfilled, (state, action) => {
//         state.createLoading = false;
//         state.categories = [...state.categories, action.payload];
//       })
//       .addCase(createCategory.rejected, (state, action) => {
//         state.createLoading = false;
//         state.createError = action.payload;
//       });

//     // ── updateCategory ────────────────────────────────────────
//     builder
//       .addCase(updateCategory.pending, (state) => {
//         state.updateLoading = true;
//         state.updateError = null;
//       })
//       .addCase(updateCategory.fulfilled, (state, action) => {
//         state.updateLoading = false;
//         const updated = action.payload;
//         state.categories = state.categories.map((c) =>
//           c._id === updated._id ? updated : c
//         );
//       })
//       .addCase(updateCategory.rejected, (state, action) => {
//         state.updateLoading = false;
//         state.updateError = action.payload;
//       });

//     // ── deleteCategory ────────────────────────────────────────
//     builder
//       .addCase(deleteCategory.pending, (state) => {
//         state.deleteLoading = true;
//         state.deleteError = null;
//       })
//       .addCase(deleteCategory.fulfilled, (state, action) => {
//         state.deleteLoading = false;
//         // Soft delete — set status inactive or remove from list
//         state.categories = state.categories.filter(
//           (c) => c._id !== action.payload
//         );
//       })
//       .addCase(deleteCategory.rejected, (state, action) => {
//         state.deleteLoading = false;
//         state.deleteError = action.payload;
//       });
//   },
// });

// export const { clearCategoryErrors } = categoriesSlice.actions;
// export default categoriesSlice.reducer;