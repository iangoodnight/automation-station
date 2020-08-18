const axios = require('axios');
const dotenv = require('dotenv');
const Bottleneck = require('bottleneck');

dotenv.config();

const vendorLogin = process.argv[2] || '';

const limiter = new Bottleneck({
	maxConcurrent: 1,
	minTime: 333
});

async function main() {
	let profileId = await getProfileId();
	let products = await getProductSkus(profileId);
	let skus = listSkus(products);
	let inventory = await getSkuVaultInventory(skus);
	// Inventory.errors returns products not found.  Add error logging here later.
	let data = zip(products, inventory.data);
	console.log(data);
	console.log(inventory.errors);
	let wrapped = limiter.wrap(updateInventory);
	for (let i = 0; i < data.length; i++) {
		let update = await wrapped(data[i]);
	};
	console.log('Great success!');
};

async function getProfileId() {
	let profileUrl = 'https://boutsy.com/admin.php?target=RESTAPI&_key=' + process.env.BOUTSY_API_KEY + '&_path=profile&_cnd[login]=' + vendorLogin + '&_cnd[onlyReal]=true';
	try {
		let data = await axios.get(profileUrl);
		if (data.data.length > 0) {
			return data.data[0].profile_id;			
		} else {
			throw new Error('Profile ID not found.  Try a different email address');
		}	
	} catch (error) {
		console.log(error);
	}

};

async function getProductSkus(profileId) {
	let productUrl = 'https://boutsy.com/admin.php?target=RESTAPI&_key=' + process.env.BOUTSY_API_KEY + '&_path=profile/' + profileId;
	try {
		let data = await axios.get(productUrl);
		let products;
		data.data.products ? products = data.data.products: products = [];
		if (products.length > 0) {
			return products.map(product => {
				let sku = product.sku;
				let id;
				let obj = {
					sku: product.sku,
					id: product.product_id
				};
				return obj;
			});
		} else {
			throw new Error('No products found for that profile ID.  Try a different profile.');
		}
	} catch (error) {
		console.log(error);
	}
};

function listSkus(products) {
	let skus = [];
	try {
		products.forEach(product => {
			skus.push(product.sku);
		});
		return skus;		
	} catch (error) {
		console.log(error);
	};
};

async function getSkuVaultInventory(skus) {
	try {
		let skuVaultUrl = 'https://app.skuvault.com/api/products/getProducts';
		let data = await axios({
			method: 'post',
			url: skuVaultUrl,
			data: {
  				"ModifiedAfterDateTimeUtc": "0000-00-00T00:00:00.0000000Z",
  				"ModifiedBeforeDateTimeUtc": "0000-00-00T00:00:00.0000000Z",
  				"PageNumber": 0,
  				"PageSize": 10000,
  				"ProductSKUs": skus,
  				"TenantToken": process.env.SKUVAULT_TENANT_TOKEN,
  				"UserToken": process.env.SKUVAULT_USER_TOKEN
			}
		});
		let inventory = data.data.Products.map(product => {
			return {
				sku: product.Sku,
				qty: product.QuantityAvailable
			};
		});
		return { 
			data: inventory,
			errors: data.data.Errors
		};		
	} catch (error) {
		console.log(error);
	};
};

function zip(products, inventory) {
	try {
		let zipped = [];
		products.forEach(product => {
			let qtyObj = inventory.find(obj => obj.sku === product.sku);
			if (qtyObj) {
				let result = {
					sku: product.sku,
					id: product.id,
					qty: qtyObj.qty
				};
				zipped.push(result);
			}
		});
		return zipped;		
	} catch (error) {
		console.log(error);
	};
};

async function updateInventory(product) {
	let boutsyPutUrl = 'https://boutsy.com/admin.php?target=RESTAPI&_key=' + 
		process.env.BOUTSY_API_KEY + 
		'&_path=product/' + product.id +
		'&_method=put' +
		'&model[amount]=' + product.qty;
	try {
		let response = await axios({
			method: 'put',
			url: boutsyPutUrl
		});
		if (response.status === 200) {
			console.log(`Updated: ${product.sku} to ${product.qty}`);
		} else {
			throw new Error('You are overwhelming Boutsy!');
		}
	} catch (error)	{
		console.log(error);
	}	
};


main();