import mongoose from 'mongoose'

const exampleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
  },
  { timestamps: true },
)

export default mongoose.model('Example', exampleSchema)
