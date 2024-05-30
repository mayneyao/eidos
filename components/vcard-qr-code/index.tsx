import QRCode from "react-qr-code"

interface IVCardQrCodeProps {
  lastName: string // space name
  firstName: string
  email: string
}

export const VCardQrCode = ({
  lastName,
  firstName,
  email,
}: IVCardQrCodeProps) => {
  const vCardInfo = `BEGIN:VCARD
VERSION:3.0
N:${lastName};${firstName};;;
FN:${firstName + " " + lastName}
EMAIL:${email}
END:VCARD`
  return <QRCode value={vCardInfo} />
}
