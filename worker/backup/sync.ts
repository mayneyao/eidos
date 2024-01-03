export class OpfsSync {
  // s3: S3
  bucket: string
  constructor(props: {
    bucket: string
    endpoint: string
    accessKeyId: string
    secretAccessKey: string
  }) {
    const { endpoint, accessKeyId, secretAccessKey } = props
    this.bucket = props.bucket
    // this.s3 = new S3({
    //   endpoint,
    //   accessKeyId,
    //   secretAccessKey,
    //   signatureVersion: "v4",
    // })
    // this.listCloudObjects().then((res) => {
    //   console.log(res)
    // })
  }

  async listCloudObjects() {
    // const data = await this.s3.listBuckets().promise()
    // return data
  }
}
