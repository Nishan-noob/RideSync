import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { getOrCreateDeviceUserId, loadDisplayName, saveDisplayName } from '../../utils/id'

type SessionState = {
  userId: string
  displayName: string
}

const initialState: SessionState = {
  userId: getOrCreateDeviceUserId(),
  displayName: loadDisplayName(),
}

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setDisplayName(state, action: PayloadAction<string>) {
      const next = action.payload.trim().slice(0, 40)
      state.displayName = next
      saveDisplayName(next)
    },
  },
})

export const { setDisplayName } = sessionSlice.actions
export default sessionSlice.reducer
