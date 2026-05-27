require('dotenv').config();
const { KMSClient, GetPublicKeyCommand } = require('@aws-sdk/client-kms');
const { ethers } = require('ethers');
const asn1 = require('asn1.js');

// Define the ASN.1 schema to extract the raw key from AWS
const EcdsaPubKey = asn1.define('EcdsaPubKey', function () {
  this.seq().obj(
    this.key('algo').seq().obj(this.key('a').objid(), this.key('b').objid()),
    this.key('pubKey').bitstr()
  );
});

async function main() {
  console.log('🛠️  Initiating Secure Handshake with AWS Stockholm...');

  // Extreme cleaning of environment variables
  const clean = (val) => (val || '').replace(/[^a-zA-Z0-9+/=]/g, '').trim();

  const accessKeyId = clean(process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = clean(process.env.AWS_SECRET_ACCESS_KEY);
  const region = (process.env.AWS_REGION || 'eu-north-1').trim();
  const keyId = (process.env.AWS_KMS_KEY_ID || '').trim();

  // Verify cleaning worked
  if (accessKeyId.length < 16) throw new Error('AWS_ACCESS_KEY_ID looks too short or empty!');

  const kmsClient = new KMSClient({
    region: region,
    credentials: {
      accessKeyId: accessKeyId, // MUST BE EXACTLY THIS NAME
      secretAccessKey: secretAccessKey, // MUST BE EXACTLY THIS NAME
    },
  });

  try {
    const command = new GetPublicKeyCommand({ KeyId: keyId });
    const response = await kmsClient.send(command);

    // Extract the raw public key from the DER-encoded response
    const res = EcdsaPubKey.decode(Buffer.from(response.PublicKey), 'der');
    const rawPubKey = res.pubKey.data;

    // Compute the Ethereum Address
    const address = ethers.computeAddress('0x' + rawPubKey.toString('hex'));

    console.log('\n===============================================');
    console.log('🚀 SALVA MASTER WALLET FOUND!');
    console.log(`Address: ${address}`);
    console.log('===============================================\n');
    console.log("💡 This address is your unique 'Salva Vault' identity.");
  } catch (err) {
    console.error('\n❌ AWS ERROR:', err.name);
    console.error('Message:', err.message);
    console.log('\n💡 Check your .env file for extra spaces or quotes.');
  }
}

main();
// SALVA MASTER WALLET FOUND!
// Address: 0xCb8946b8ac21A288c6C09511Edd4a5277f814C38
// node get-address.js
